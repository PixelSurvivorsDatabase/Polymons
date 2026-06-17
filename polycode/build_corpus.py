from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from curriculum import curriculum_records


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = (
    ROOT / "src/game/polyProject.test.ts",
    ROOT / "studio/renderer/StudioEditor.tsx",
    ROOT / "studio/renderer/CodeEditor.tsx",
)
LANGUAGE_HINTS = {
    "cpp": ("#include", "auto ", "->", "::", "[&]"),
    "csharp": ("using Poly", "var ", "+=", "new Vector3"),
}


def language_for(text: str) -> str:
    for language, hints in LANGUAGE_HINTS.items():
        if any(hint in text for hint in hints):
            return language
    return "luau"


def normalized_text(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def record_key(record: dict[str, str]) -> str:
    return f'{record["language"]}\0{normalized_text(record["text"])}'


def valid_record(record: dict[str, str]) -> bool:
    text = normalized_text(record.get("text", ""))
    if record.get("language") not in {"luau", "cpp", "csharp"}:
        return False
    if not 16 <= len(text) <= 5000 or "\0" in text:
        return False
    if text.count('"') % 2 != 0 or text.count("'") % 2 != 0:
        return False
    return structurally_valid(record["language"], text)


def without_strings_and_comments(language: str, text: str) -> str:
    if language == "luau":
        text = re.sub(r"--\[\[.*?\]\]", "", text, flags=re.DOTALL)
        text = re.sub(r"--.*$", "", text, flags=re.MULTILINE)
    else:
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
        text = re.sub(r"//.*$", "", text, flags=re.MULTILINE)
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', text)


def delimiters_balanced(text: str) -> bool:
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    for character in text:
        if character in "([{":
            stack.append(character)
        elif character in pairs:
            if not stack or stack.pop() != pairs[character]:
                return False
    return not stack


def luau_blocks_balanced(text: str) -> bool:
    depth = 0
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if re.match(r"^(?:elseif\b.*\bthen|else)\s*$", line):
            continue
        if re.match(r"^repeat\b", line):
            depth += 1
            continue
        if re.match(r"^until\b", line):
            depth -= 1
        else:
            openings = (
                bool(re.search(r"\bfunction\s*\([^)]*\)\s*$", line))
                or bool(re.match(r"^if\b.*\bthen\s*$", line))
                or bool(re.match(r"^(?:for|while)\b.*\bdo\s*$", line))
            )
            if openings:
                depth += 1
            if re.match(r"^end\b", line):
                depth -= 1
        if depth < 0:
            return False
    return depth == 0


def structurally_valid(language: str, text: str) -> bool:
    stripped = without_strings_and_comments(language, text)
    if not delimiters_balanced(stripped):
        return False
    return language != "luau" or luau_blocks_balanced(stripped)


def extract_owned_scripts() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    patterns = (
        re.compile(r"source\s*:\s*`(.*?)`", re.DOTALL),
        re.compile(r"source\s*:\s*\"((?:\\.|[^\"\\])*)\"", re.DOTALL),
        re.compile(r"source\s*:\s*'((?:\\.|[^'\\])*)'", re.DOTALL),
    )
    for path in SOURCE_FILES:
        source = path.read_text(encoding="utf-8")
        for pattern in patterns:
            for match in pattern.finditer(source):
                text = normalized_text(
                    match.group(1)
                    .replace("\\n", "\n")
                    .replace('\\"', '"')
                    .replace("\\'", "'")
                )
                records.append(
                    {
                        "language": language_for(text),
                        "topic": "project-owned",
                        "text": text,
                        "source": str(path.relative_to(ROOT)).replace("\\", "/"),
                    }
                )
    return records


def load_imported_scripts(directory: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    if not directory.exists():
        return records
    for path in sorted(directory.glob("*.jsonl")):
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                records.append(
                    {
                        "language": record["language"],
                        "topic": "published-game",
                        "text": normalized_text(record["text"]),
                        "source": record.get("source", path.stem),
                    }
                )
    return records


def deduplicate(records: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    unique: dict[str, dict[str, str]] = {}
    rejected = 0
    for record in records:
        if not valid_record(record):
            rejected += 1
            continue
        record["text"] = normalized_text(record["text"])
        unique.setdefault(record_key(record), record)
    return list(unique.values()), rejected


def is_validation_record(record: dict[str, str], percent: int) -> bool:
    digest = hashlib.sha256(record_key(record).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % 100 < percent


def split_records(
    records: list[dict[str, str]], validation_percent: int
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    training: list[dict[str, str]] = []
    validation: list[dict[str, str]] = []
    for record in records:
        if record["topic"] in {"published-game", "project-owned"}:
            training.append(record)
        elif is_validation_record(record, validation_percent):
            validation.append(record)
        else:
            training.append(record)
    return training, validation


def weight_owned_records(
    training: list[dict[str, str]], published_weight: int, project_weight: int
) -> list[dict[str, str]]:
    weighted: list[dict[str, str]] = []
    for record in training:
        weight = 1
        if record["topic"] == "published-game":
            weight = published_weight
        elif record["topic"] == "project-owned":
            weight = project_weight
        weighted.extend(dict(record) for _ in range(weight))
    return weighted


def write_jsonl(path: Path, records: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=600)
    parser.add_argument(
        "--owned-directory",
        type=Path,
        default=Path(__file__).parent / "data/owned",
    )
    parser.add_argument("--published-weight", type=int, default=20)
    parser.add_argument("--project-weight", type=int, default=2)
    parser.add_argument("--validation-percent", type=int, default=5)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parent / "data/generated",
    )
    args = parser.parse_args()

    raw_records = [
        *extract_owned_scripts(),
        *load_imported_scripts(args.owned_directory),
        *curriculum_records(args.rounds),
    ]
    unique_records, rejected = deduplicate(raw_records)
    training, validation = split_records(
        unique_records, args.validation_percent
    )
    weighted_training = weight_owned_records(
        training, args.published_weight, args.project_weight
    )
    write_jsonl(args.output_dir / "train.jsonl", weighted_training)
    write_jsonl(args.output_dir / "validation.jsonl", validation)

    languages = Counter(record["language"] for record in unique_records)
    topics = Counter(record["topic"] for record in unique_records)
    summary = {
        "rawRecords": len(raw_records),
        "uniqueRecords": len(unique_records),
        "duplicatesRemoved": len(raw_records) - len(unique_records) - rejected,
        "rejectedRecords": rejected,
        "trainingRecords": len(weighted_training),
        "uniqueTrainingRecords": len(training),
        "validationRecords": len(validation),
        "languages": dict(sorted(languages.items())),
        "topics": dict(sorted(topics.items())),
    }
    (args.output_dir / "corpus-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
