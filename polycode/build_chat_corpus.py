from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from chat_curriculum import chat_curriculum


def split_key(record: dict[str, str]) -> int:
    digest = hashlib.sha256(record["text"].encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def write_jsonl(path: Path, records: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=24)
    parser.add_argument(
        "--output-dir", type=Path, default=base / "data/generated-chat"
    )
    parser.add_argument("--validation-percent", type=int, default=8)
    args = parser.parse_args()

    unique: dict[str, dict[str, str]] = {}
    for record in chat_curriculum(args.rounds):
        unique.setdefault(record["text"], record)
    records = list(unique.values())
    training = [
        record
        for record in records
        if split_key(record) >= args.validation_percent
    ]
    validation = [
        record
        for record in records
        if split_key(record) < args.validation_percent
    ]
    if not validation and training:
        validation = training[-max(1, len(training) // 12) :]
        training = training[: -len(validation)]

    write_jsonl(args.output_dir / "train.jsonl", training)
    write_jsonl(args.output_dir / "validation.jsonl", validation)
    (args.output_dir / "corpus-summary.json").write_text(
        json.dumps(
            {
                "records": len(records),
                "trainingRecords": len(training),
                "validationRecords": len(validation),
                "validationPercent": args.validation_percent,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"chat_records={len(records):,} "
        f"train={len(training):,} validation={len(validation):,}"
    )


if __name__ == "__main__":
    main()
