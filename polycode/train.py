from __future__ import annotations

import argparse
import json
import math
import random
import time
from dataclasses import asdict
from pathlib import Path

import torch
from tokenizers import Tokenizer

from model import ModelConfig, PolyCodeModel


def save_checkpoint(
    path: Path,
    model: PolyCodeModel,
    optimizer: torch.optim.Optimizer,
    config: ModelConfig,
    step: int,
    parameters: int,
) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    torch.save(
        {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "model_config": asdict(config),
            "step": step,
            "parameters": parameters,
        },
        temporary,
    )
    temporary.replace(path)


def load_records(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def encoded_records(
    tokenizer: Tokenizer, records: list[dict[str, str]]
) -> list[torch.Tensor]:
    bos = tokenizer.token_to_id("<|bos|>")
    eos = tokenizer.token_to_id("<|eos|>")
    pad = tokenizer.token_to_id("<|pad|>")
    if bos is None or eos is None or pad is None:
        raise ValueError("tokenizer is missing BOS, EOS, or PAD")
    encoded: list[torch.Tensor] = []
    for record in records:
        language = tokenizer.token_to_id(f'<|{record["language"]}|>')
        if language is None:
            raise ValueError(f'missing language token for {record["language"]}')
        tokens = [language, bos, *tokenizer.encode(record["text"]).ids, eos]
        encoded.append(torch.tensor(tokens, dtype=torch.long))
    return encoded


def batch(
    records: list[torch.Tensor],
    batch_size: int,
    sequence_length: int,
    pad_token: int,
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor]:
    if not records:
        raise ValueError("corpus has no training records")
    inputs: list[torch.Tensor] = []
    targets: list[torch.Tensor] = []
    for record_index in torch.randint(0, len(records), (batch_size,)).tolist():
        record = records[record_index][: sequence_length + 1]
        source = record[:-1]
        target = record[1:]
        padding = sequence_length - len(source)
        if padding > 0:
            source = torch.cat(
                (source, torch.full((padding,), pad_token, dtype=torch.long))
            )
            target = torch.cat(
                (target, torch.full((padding,), -100, dtype=torch.long))
            )
        inputs.append(source)
        targets.append(target)
    inputs = torch.stack(inputs)
    targets = torch.stack(targets)
    return inputs.to(device), targets.to(device)


@torch.no_grad()
def evaluate(
    model: PolyCodeModel,
    records: list[torch.Tensor],
    batch_size: int,
    sequence_length: int,
    pad_token: int,
    device: torch.device,
    batches: int = 4,
) -> float:
    model.eval()
    losses = []
    for _ in range(batches):
        inputs, targets = batch(
            records, batch_size, sequence_length, pad_token, device
        )
        _, loss = model(inputs, targets)
        losses.append(float(loss))
    model.train()
    return sum(losses) / len(losses)


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=base / "config/model.json")
    parser.add_argument(
        "--tokenizer", type=Path, default=base / "artifacts/tokenizer-28m.json"
    )
    parser.add_argument(
        "--train-data", type=Path, default=base / "data/generated/train.jsonl"
    )
    parser.add_argument(
        "--validation-data",
        type=Path,
        default=base / "data/generated/validation.jsonl",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=base / "checkpoints-28m"
    )
    parser.add_argument("--max-steps", type=int, default=6000)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--sequence-length", type=int, default=256)
    parser.add_argument("--gradient-accumulation", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--eval-interval", type=int, default=100)
    parser.add_argument("--log-interval", type=int, default=10)
    parser.add_argument("--checkpoint-interval", type=int, default=250)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--resume", type=Path)
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(min(6, torch.get_num_threads()))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tokenizer = Tokenizer.from_file(str(args.tokenizer))
    raw_config = json.loads(args.config.read_text(encoding="utf-8"))
    raw_config["vocab_size"] = tokenizer.get_vocab_size()
    config = ModelConfig(**raw_config)
    if args.sequence_length > config.max_sequence_length:
        raise ValueError("sequence length exceeds model configuration")

    training = encoded_records(tokenizer, load_records(args.train_data))
    validation = encoded_records(tokenizer, load_records(args.validation_data))
    pad_token = tokenizer.token_to_id("<|pad|>")
    if pad_token is None:
        raise ValueError("tokenizer is missing PAD")
    model = PolyCodeModel(config).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=0.1
    )
    starting_step = 0
    if args.resume:
        saved = torch.load(args.resume, map_location=device, weights_only=False)
        saved_config = ModelConfig(**saved["model_config"])
        if saved_config != config:
            raise ValueError("resume checkpoint model configuration does not match")
        model.load_state_dict(saved["model"])
        if "optimizer" in saved:
            optimizer.load_state_dict(saved["optimizer"])
        starting_step = int(saved.get("step", 0))
        print(f"resumed checkpoint at step {starting_step} from {args.resume}")
    parameters = model.parameter_count()
    print(
        f"device={device} parameters={parameters:,} "
        f"train_records={len(training):,} validation_records={len(validation):,}"
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    metrics: list[dict[str, float | int]] = []
    started = time.perf_counter()
    model.train()
    optimizer.zero_grad(set_to_none=True)
    for local_step in range(1, args.max_steps + 1):
        step = starting_step + local_step
        accumulated = 0.0
        for _ in range(args.gradient_accumulation):
            inputs, targets = batch(
                training,
                args.batch_size,
                args.sequence_length,
                pad_token,
                device,
            )
            _, loss = model(inputs, targets)
            (loss / args.gradient_accumulation).backward()
            accumulated += float(loss.detach())
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)

        training_loss = accumulated / args.gradient_accumulation
        should_evaluate = local_step == 1 or local_step == args.max_steps or (
            args.eval_interval > 0 and local_step % args.eval_interval == 0
        )
        validation_loss = (
            evaluate(
                model,
                validation,
                args.batch_size,
                args.sequence_length,
                pad_token,
                device,
            )
            if should_evaluate
            else math.nan
        )
        metrics.append(
            {
                "step": step,
                "training_loss": training_loss,
                "validation_loss": validation_loss,
                "elapsed_seconds": time.perf_counter() - started,
            }
        )
        if (
            local_step == 1
            or local_step == args.max_steps
            or local_step % args.log_interval == 0
            or should_evaluate
        ):
            validation_text = (
                f"{validation_loss:.4f}"
                if not math.isnan(validation_loss)
                else "-"
            )
            print(
                f"step={step} train_loss={training_loss:.4f} "
                f"validation_loss={validation_text}"
            )
        if (
            args.checkpoint_interval > 0
            and local_step < args.max_steps
            and local_step % args.checkpoint_interval == 0
        ):
            rolling = args.output_dir / "checkpoint-latest.pt"
            save_checkpoint(
                rolling, model, optimizer, config, step, parameters
            )
            print(f"saved rolling checkpoint to {rolling}")

    checkpoint = args.output_dir / "checkpoint-final.pt"
    save_checkpoint(
        checkpoint,
        model,
        optimizer,
        config,
        starting_step + args.max_steps,
        parameters,
    )
    summary = {
        "device": str(device),
        "parameters": parameters,
        "starting_step": starting_step,
        "steps_this_run": args.max_steps,
        "total_steps": starting_step + args.max_steps,
        "sequence_length": args.sequence_length,
        "batch_size": args.batch_size,
        "gradient_accumulation": args.gradient_accumulation,
        "elapsed_seconds": time.perf_counter() - started,
        "final_training_loss": metrics[-1]["training_loss"],
        "final_validation_loss": metrics[-1]["validation_loss"],
    }
    (args.output_dir / "training-metrics.json").write_text(
        json.dumps({"summary": summary, "history": metrics}, indent=2),
        encoding="utf-8",
    )
    print(f"saved checkpoint to {checkpoint}")


if __name__ == "__main__":
    main()
