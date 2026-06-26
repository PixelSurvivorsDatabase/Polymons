from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from tokenizers import Tokenizer

from model import ModelConfig, PolyCodeModel


@dataclass
class Memory:
    notes: list[str]
    turns: list[dict[str, str]]


def load_memory(path: Path) -> Memory:
    if not path.exists():
        return Memory(notes=[], turns=[])
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        backup = path.with_suffix(path.suffix + ".broken")
        path.replace(backup)
        print(f"Memory was invalid JSON, moved it to {backup}")
        return Memory(notes=[], turns=[])
    notes = [str(note) for note in raw.get("notes", [])]
    turns = []
    for turn in raw.get("turns", []):
        if isinstance(turn, dict) and "user" in turn and "assistant" in turn:
            turns.append(
                {
                    "user": str(turn["user"]),
                    "assistant": str(turn["assistant"]),
                }
            )
    return Memory(notes=notes, turns=turns)


def save_memory(path: Path, memory: Memory, max_turns: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "notes": memory.notes[-100:],
        "turns": memory.turns[-max_turns:],
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def token_count(tokenizer: Tokenizer, text: str) -> int:
    return len(tokenizer.encode(text).ids)


def clean_answer(text: str) -> str:
    decoded = text.strip()
    if "PolyGPT:" in decoded:
        decoded = decoded.rsplit("PolyGPT:", 1)[-1].strip()
    elif "PolyCode:" in decoded:
        decoded = decoded.rsplit("PolyCode:", 1)[-1].strip()
    for marker in (
        "\nUser:",
        "\r\nUser:",
        "\nYou:",
        "\r\nYou:",
        "\nSystem:",
        "\r\nSystem:",
        "<|endchat|>",
        "<|eos|>",
    ):
        if marker in decoded:
            decoded = decoded.split(marker, 1)[0].strip()
    return decoded


def build_prompt(
    tokenizer: Tokenizer,
    memory: Memory,
    message: str,
    token_budget: int,
) -> str:
    header = (
        "<|chat|>\n"
        "System: You are PolyGPT, a friendly Polymons assistant. "
        "Answer conversationally, but keep coding help concise and practical. "
        "When you write Luau, prefer Polymons-compatible APIs.\n"
    )
    if memory.notes:
        header += "Persistent memory:\n"
        for note in memory.notes[-12:]:
            header += f"- {note}\n"
    header += "Recent conversation:\n"
    current = f"User: {message}\nPolyGPT:"

    selected: list[str] = []
    reserved = token_count(tokenizer, header + current)
    for turn in reversed(memory.turns):
        block = f"User: {turn['user']}\nPolyGPT: {turn['assistant']}\n"
        if reserved + token_count(tokenizer, block) > token_budget:
            break
        selected.append(block)
        reserved += token_count(tokenizer, block)

    return header + "".join(reversed(selected)) + current


def load_model(checkpoint: Path, tokenizer: Tokenizer) -> PolyCodeModel:
    saved: dict[str, Any] = torch.load(
        checkpoint, map_location="cpu", weights_only=False
    )
    raw_config = dict(saved["model_config"])
    raw_config["vocab_size"] = tokenizer.get_vocab_size()
    model = PolyCodeModel(ModelConfig(**raw_config))
    state = saved["model"]
    # Some inference checkpoints may be half precision. CPU inference is safer
    # when the tiny model is loaded as float32.
    state = {
        key: value.float() if torch.is_floating_point(value) else value
        for key, value in state.items()
    }
    model.load_state_dict(state)
    model.eval()
    return model


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
    generated = generated[-model.config.max_sequence_length :]
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
    answer = clean_answer(decoded)
    return answer or "(no response)"


def print_help(memory_path: Path) -> None:
    print(
        "Commands:\n"
        "  /exit or /quit     stop chatting\n"
        "  /remember TEXT     save a persistent note\n"
        "  /memory            show memory stats\n"
        "  /reset             clear chat turns, keep notes\n"
        "  /forget            clear turns and notes\n"
        f"Memory file: {memory_path}\n"
    )


def main() -> None:
    base = Path(__file__).parent
    checkpoint_candidates = [
        base / "checkpoints-polygpt-13m/checkpoint-final.pt",
        base / "checkpoints-polygpt-13m/checkpoint-latest.pt",
        base / "checkpoints/checkpoint-final-inference.pt",
        base / "checkpoints/checkpoint-final.pt",
    ]
    default_checkpoint = next(
        (candidate for candidate in checkpoint_candidates if candidate.exists()),
        checkpoint_candidates[0],
    )

    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=default_checkpoint)
    parser.add_argument(
        "--tokenizer", type=Path, default=base / "artifacts/tokenizer.json"
    )
    parser.add_argument(
        "--memory", type=Path, default=base / "memory/polygpt-memory.json"
    )
    parser.add_argument("--message", default="")
    parser.add_argument("--tokens", type=int, default=128)
    parser.add_argument("--context-tokens", type=int, default=420)
    parser.add_argument("--temperature", type=float, default=0.55)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--max-memory-turns", type=int, default=80)
    args = parser.parse_args()

    if not args.checkpoint.exists():
        raise SystemExit(
            "The 13M PolyGPT checkpoint was not found. Expected:\n"
            f"  {args.checkpoint}\n"
            "Train or restore the 13M checkpoint first."
        )

    tokenizer = Tokenizer.from_file(str(args.tokenizer))
    model = load_model(args.checkpoint, tokenizer)
    torch.manual_seed(args.seed)

    usable_context = max(128, min(args.context_tokens, model.config.max_sequence_length))
    if args.context_tokens > model.config.max_sequence_length:
        print(
            f"Context request clamped to {model.config.max_sequence_length} tokens "
            "because this checkpoint was trained with that max length."
        )

    memory = load_memory(args.memory)
    print("PolyGPT 13M terminal chat. Type /help for commands, /exit to stop.")
    print(f"Loaded {len(memory.turns)} saved turns and {len(memory.notes)} notes.")

    first = args.message.strip()
    one_shot = bool(first)
    while True:
        if first:
            message = first
            first = ""
            print(f"You: {message}")
        else:
            message = input("You: ").strip()
        if not message:
            continue
        command = message.lower()
        if command in {"/exit", "/quit", "exit", "quit", "q"}:
            save_memory(args.memory, memory, args.max_memory_turns)
            break
        if command == "/help":
            print_help(args.memory)
            continue
        if command == "/memory":
            print(
                f"Memory: {len(memory.turns)} turns, {len(memory.notes)} notes\n"
                f"Path: {args.memory}"
            )
            continue
        if command == "/reset":
            memory.turns.clear()
            save_memory(args.memory, memory, args.max_memory_turns)
            print("Cleared chat turns. Notes kept.")
            continue
        if command == "/forget":
            memory.turns.clear()
            memory.notes.clear()
            save_memory(args.memory, memory, args.max_memory_turns)
            print("Cleared chat turns and notes.")
            continue
        if message.startswith("/remember "):
            note = message[len("/remember ") :].strip()
            if note:
                memory.notes.append(note)
                save_memory(args.memory, memory, args.max_memory_turns)
                print("Remembered.")
            continue

        prompt = build_prompt(tokenizer, memory, message, usable_context)
        answer = generate(
            model,
            tokenizer,
            prompt,
            args.tokens,
            args.temperature,
            args.top_k,
        )
        print(f"PolyGPT: {answer}\n")
        memory.turns.append({"user": message, "assistant": answer})
        save_memory(args.memory, memory, args.max_memory_turns)
        if one_shot:
            break


if __name__ == "__main__":
    main()
