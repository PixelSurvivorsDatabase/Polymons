from __future__ import annotations

import argparse
from pathlib import Path

import torch
from tokenizers import Tokenizer

from model import ModelConfig, PolyCodeModel


def generate(
    model: PolyCodeModel,
    tokenizer: Tokenizer,
    prompt: str,
    tokens: int,
    temperature: float,
    top_k: int,
) -> str:
    language = tokenizer.token_to_id("<|luau|>")
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
        for _ in range(tokens):
            context = generated[-model.config.max_sequence_length :]
            input_ids = torch.tensor([context], dtype=torch.long)
            logits, _ = model(input_ids)
            scores = logits[0, -1] / max(temperature, 0.01)
            for token in blocked_tokens:
                scores[token] = -torch.inf
            values, indices = torch.topk(scores, min(top_k, len(scores)))
            probabilities = torch.softmax(values, dim=-1)
            next_id = int(indices[torch.multinomial(probabilities, 1)])
            if next_id == eos:
                break
            generated.append(next_id)

    decoded = tokenizer.decode(generated, skip_special_tokens=True)
    if "PolyCode:" in decoded:
        decoded = decoded.rsplit("PolyCode:", 1)[-1]
    for marker in ("<|endchat|>", "\nUser:", "\r\nUser:"):
        if marker in decoded:
            decoded = decoded.split(marker, 1)[0]
    return decoded.strip()


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=base / "checkpoints-chat-6m/checkpoint-final.pt",
    )
    parser.add_argument(
        "--tokenizer", type=Path, default=base / "artifacts/tokenizer.json"
    )
    parser.add_argument("--message", default="")
    parser.add_argument("--tokens", type=int, default=160)
    parser.add_argument("--temperature", type=float, default=0.55)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()

    if not args.checkpoint.exists():
        raise SystemExit(
            "The 6M chat checkpoint has not been trained yet.\n"
            "Run:\n"
            "  python polycode/build_chat_corpus.py\n"
            "  python polycode/train.py --config polycode/config/model-6m-chat.json "
            "--tokenizer polycode/artifacts/tokenizer.json "
            "--train-data polycode/data/generated-chat/train.jsonl "
            "--validation-data polycode/data/generated-chat/validation.jsonl "
            "--output-dir polycode/checkpoints-chat-6m "
            "--sequence-length 256 --batch-size 1 --gradient-accumulation 2 "
            "--max-steps 1500"
        )

    torch.manual_seed(args.seed)
    tokenizer = Tokenizer.from_file(str(args.tokenizer))
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    model = PolyCodeModel(ModelConfig(**saved["model_config"]))
    model.load_state_dict(saved["model"])
    model.eval()

    print("PolyCode 6M chat. Type exit to stop.")
    history: list[tuple[str, str]] = []
    first = args.message.strip()
    one_shot = bool(first)
    while True:
        if first:
            message = first
            first = ""
            print(f"You: {message}")
        else:
            message = input("You: ").strip()
        if message.lower() in {"exit", "quit", "q"}:
            break
        transcript = "<|chat|>\n"
        for user, assistant in history[-4:]:
            transcript += f"User: {user}\nPolyCode: {assistant}\n"
        transcript += f"User: {message}\nPolyCode:"
        answer = generate(
            model,
            tokenizer,
            transcript,
            args.tokens,
            args.temperature,
            args.top_k,
        )
        print(f"PolyCode: {answer}\n")
        history.append((message, answer))
        if one_shot:
            break


if __name__ == "__main__":
    main()
