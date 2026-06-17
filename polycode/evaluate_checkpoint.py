from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import torch
import torch.nn.functional as F
from tokenizers import Tokenizer

sys.path.insert(0, str(Path(__file__).parent))
from model import ModelConfig, PolyCodeModel


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=base / "checkpoints-28m/checkpoint-final.pt",
    )
    parser.add_argument(
        "--tokenizer", type=Path, default=base / "artifacts/tokenizer-28m.json"
    )
    parser.add_argument(
        "--data", type=Path, default=base / "data/generated/validation.jsonl"
    )
    parser.add_argument("--limit-per-topic", type=int, default=30)
    args = parser.parse_args()

    if not args.checkpoint.exists():
        raise SystemExit(
            "The 28M checkpoint has not been trained yet. "
            "Run: python polycode/train.py"
        )
    tokenizer = Tokenizer.from_file(str(args.tokenizer))
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    model = PolyCodeModel(ModelConfig(**saved["model_config"]))
    model.load_state_dict(saved["model"])
    model.eval()

    totals: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    counts: dict[str, int] = defaultdict(int)
    with args.data.open(encoding="utf-8") as handle, torch.no_grad():
        for line in handle:
            record = json.loads(line)
            topic = record.get("topic", "unknown")
            if counts[topic] >= args.limit_per_topic:
                continue
            language = tokenizer.token_to_id(f'<|{record["language"]}|>')
            bos = tokenizer.token_to_id("<|bos|>")
            eos = tokenizer.token_to_id("<|eos|>")
            ids = [language, bos, *tokenizer.encode(record["text"]).ids, eos]
            if any(token is None for token in ids):
                continue
            ids = ids[-model.config.max_sequence_length :]
            inputs = torch.tensor([ids[:-1]], dtype=torch.long)
            targets = torch.tensor(ids[1:], dtype=torch.long)
            logits, _ = model(inputs)
            loss = F.cross_entropy(logits[0], targets, reduction="sum")
            totals[topic][0] += float(loss)
            totals[topic][1] += len(targets)
            counts[topic] += 1

    results = {}
    all_loss = 0.0
    all_tokens = 0.0
    for topic in sorted(totals):
        loss, tokens = totals[topic]
        average = loss / tokens
        results[topic] = {
            "records": counts[topic],
            "loss": round(average, 4),
            "perplexity": round(math.exp(min(average, 20)), 3),
        }
        all_loss += loss
        all_tokens += tokens
    overall = all_loss / all_tokens
    print(
        json.dumps(
            {
                "checkpointStep": saved.get("step", 0),
                "overallLoss": round(overall, 4),
                "overallPerplexity": round(math.exp(min(overall, 20)), 3),
                "topics": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
