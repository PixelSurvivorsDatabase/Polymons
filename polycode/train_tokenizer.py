from __future__ import annotations

import argparse
import json
from pathlib import Path

from tokenizers import Tokenizer
from tokenizers.decoders import ByteLevel as ByteLevelDecoder
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import ByteLevel
from tokenizers.trainers import BpeTrainer


SPECIAL_TOKENS = (
    "<|pad|>",
    "<|unk|>",
    "<|bos|>",
    "<|eos|>",
    "<|luau|>",
    "<|cpp|>",
    "<|csharp|>",
)


def corpus_lines(paths: list[Path]):
    for path in paths:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                record = json.loads(line)
                yield f'<|{record["language"]}|>\n{record["text"]}'


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        nargs="+",
        type=Path,
        default=[
            base / "data/generated/train.jsonl",
            base / "data/generated/validation.jsonl",
        ],
    )
    parser.add_argument("--vocab-size", type=int, default=8192)
    parser.add_argument(
        "--output", type=Path, default=base / "artifacts/tokenizer-28m.json"
    )
    args = parser.parse_args()

    tokenizer = Tokenizer(BPE(unk_token="<|unk|>"))
    tokenizer.pre_tokenizer = ByteLevel(add_prefix_space=False)
    tokenizer.decoder = ByteLevelDecoder()
    trainer = BpeTrainer(
        vocab_size=args.vocab_size,
        min_frequency=2,
        special_tokens=list(SPECIAL_TOKENS),
        show_progress=True,
    )
    tokenizer.train_from_iterator(corpus_lines(args.data), trainer=trainer)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tokenizer.save(str(args.output))
    print(f"saved {tokenizer.get_vocab_size()} tokens to {args.output}")


if __name__ == "__main__":
    main()
