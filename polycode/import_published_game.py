from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen


DEFAULT_API = "https://polymons-server.onrender.com"


def main() -> None:
    base = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("game_id")
    parser.add_argument("--api-url", default=DEFAULT_API)
    parser.add_argument(
        "--output",
        type=Path,
        default=base / "data/owned/published-game.jsonl",
    )
    parser.add_argument("--minimum-characters", type=int, default=16)
    args = parser.parse_args()

    url = f'{args.api_url.rstrip("/")}/v1/games/{args.game_id}'
    request = Request(url, headers={"User-Agent": "PolyCode corpus importer"})
    with urlopen(request, timeout=90) as response:
        payload = json.load(response)

    game = payload["game"]
    manifest = game.get("manifest") or {}
    language = manifest.get("language", "luau")
    records = []
    for script in manifest.get("scripts", []):
        source = str(script.get("source", "")).strip()
        if len(source) < args.minimum_characters:
            continue
        records.append(
            {
                "language": language,
                "text": source,
                "source": (
                    f'published-game:{game["id"]}:v{game.get("version", 0)}:'
                    f'{script.get("name", "Script")}'
                ),
                "metadata": {
                    "game": game["title"],
                    "gameId": game["id"],
                    "version": game.get("version"),
                    "scriptName": script.get("name"),
                    "scriptKind": script.get("kind"),
                    "parent": script.get("parent"),
                },
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")
    print(
        f'imported {len(records)} scripts from {game["title"]} '
        f'version {game.get("version")} to {args.output}'
    )


if __name__ == "__main__":
    main()
