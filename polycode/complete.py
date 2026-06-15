from __future__ import annotations

import argparse
from pathlib import Path

import torch
from tokenizers import Tokenizer

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
    parser.add_argument("--language", choices=("luau", "cpp", "csharp"), default="luau")
    parser.add_argument(
        "--prompt",
        default="local button = script.Parent\nbutton.Activated:Connect(function()\n    ",
    )
    parser.add_argument("--prompt-file", type=Path)
    parser.add_argument("--tokens", type=int, default=32)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()
    if args.prompt_file:
        prompt = args.prompt_file.read_text(encoding="utf-8")
        if prompt.endswith("\r\n"):
            prompt = prompt[:-2]
        elif prompt.endswith("\n"):
            prompt = prompt[:-1]
    else:
        prompt = args.prompt

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
    torch.manual_seed(args.seed)

    language = tokenizer.token_to_id(f"<|{args.language}|>")
    bos = tokenizer.token_to_id("<|bos|>")
    eos = tokenizer.token_to_id("<|eos|>")
    if language is None or bos is None or eos is None:
        raise ValueError("tokenizer is missing required control tokens")
    generated = [language, bos, *tokenizer.encode(prompt).ids]
    blocked_tokens = {
        token
        for token in (
            tokenizer.token_to_id("<|pad|>"),
            tokenizer.token_to_id("<|unk|>"),
            tokenizer.token_to_id("<|bos|>"),
            tokenizer.token_to_id("<|luau|>"),
            tokenizer.token_to_id("<|cpp|>"),
            tokenizer.token_to_id("<|csharp|>"),
        )
        if token is not None
    }
    with torch.no_grad():
        for _ in range(args.tokens):
            context = generated[-model.config.max_sequence_length :]
            input_ids = torch.tensor([context], dtype=torch.long)
            logits, _ = model(input_ids)
            scores = logits[0, -1] / max(args.temperature, 0.01)
            for token in blocked_tokens:
                scores[token] = -torch.inf
            values, indices = torch.topk(scores, min(args.top_k, len(scores)))
            probabilities = torch.softmax(values, dim=-1)
            next_id = int(indices[torch.multinomial(probabilities, 1)])
            if next_id == eos:
                break
            generated.append(next_id)

    decoded = tokenizer.decode(generated, skip_special_tokens=True)
    print(decoded)


if __name__ == "__main__":
    main()
