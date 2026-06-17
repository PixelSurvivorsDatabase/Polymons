from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from build_corpus import structurally_valid

def load(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def key(record: dict[str, str]) -> tuple[str, str]:
    return record["language"], record["text"].strip()


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--train", type=Path, default=base / "data/generated/train.jsonl"
    )
    parser.add_argument(
        "--validation",
        type=Path,
        default=base / "data/generated/validation.jsonl",
    )
    args = parser.parse_args()

    training = load(args.train)
    validation = load(args.validation)
    train_keys = {key(record) for record in training}
    validation_keys = {key(record) for record in validation}
    overlap = train_keys & validation_keys
    problems: list[str] = []
    if overlap:
        problems.append(f"{len(overlap)} exact scripts appear in both splits")
    if not validation:
        problems.append("validation split is empty")

    for split_name, records in (("training", training), ("validation", validation)):
        for index, record in enumerate(records, start=1):
            text = record.get("text", "")
            if record.get("language") not in {"luau", "cpp", "csharp"}:
                problems.append(f"{split_name}:{index} has an unknown language")
            if not 16 <= len(text) <= 5000:
                problems.append(f"{split_name}:{index} has an invalid length")
            if "\0" in text:
                problems.append(f"{split_name}:{index} contains a null byte")
            if not structurally_valid(record.get("language", ""), text):
                problems.append(
                    f"{split_name}:{index} has unbalanced code structure"
                )

    print(
        json.dumps(
            {
                "trainingRecords": len(training),
                "uniqueTrainingRecords": len(train_keys),
                "validationRecords": len(validation),
                "uniqueValidationRecords": len(validation_keys),
                "splitOverlap": len(overlap),
                "trainingTopics": dict(
                    sorted(Counter(r.get("topic", "unknown") for r in training).items())
                ),
                "validationTopics": dict(
                    sorted(Counter(r.get("topic", "unknown") for r in validation).items())
                ),
                "problems": problems,
            },
            indent=2,
        )
    )
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
