#!/usr/bin/env python3
"""Migration: old multi-file structure -> single .novel JSON file"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


def word_count(text: str) -> int:
    count = 0
    for ch in text:
        if '一' <= ch <= '鿿' or '　' <= ch <= '〿':
            count += 1
        elif ch.isascii() and ch.isalpha():
            count += 1
    return count


def migrate_one(name: str) -> bool:
    old_dir = DATA_DIR / name
    novel_file = DATA_DIR / f"{name}.novel"

    if not old_dir.is_dir():
        print(f"  [skip] {name}: not a directory")
        return False

    if novel_file.exists():
        print(f"  [skip] {name}: .novel file already exists")
        return False

    meta_path = old_dir / "meta.json"
    chapters_path = old_dir / "chapters.json"

    if not meta_path.exists() or not chapters_path.exists():
        print(f"  [skip] {name}: missing meta.json or chapters.json")
        return False

    meta = json.loads(meta_path.read_text("utf-8"))
    chapters_list = json.loads(chapters_path.read_text("utf-8"))

    chapters = []
    for ch in chapters_list:
        ch_id = ch["id"]
        content_file = old_dir / f"{ch_id}.txt"
        summary_file = old_dir / f"{ch_id}.summary.txt"

        content = content_file.read_text("utf-8") if content_file.exists() else ""
        summary = summary_file.read_text("utf-8").strip() if summary_file.exists() else ""
        if summary == "（空）":
            summary = ""

        chapters.append({
            "id": ch_id,
            "title": ch["title"],
            "order": ch["order"],
            "content": content,
            "summary": summary,
            "word_count": word_count(content),
            "created_at": meta.get("created_at", ""),
            "updated_at": meta.get("updated_at", ""),
        })

    novel_data = {
        "format_version": "1.0",
        "novel": meta,
        "chapters": chapters,
    }

    novel_file.write_text(
        json.dumps(novel_data, ensure_ascii=False, indent=2), "utf-8"
    )
    print(f"  [OK] {name}: {len(chapters)} chapters -> {novel_file.name}")
    return True


def main():
    print("=" * 50)
    print("Data migration: multi-file -> single .novel")
    print("=" * 50)

    if not DATA_DIR.exists():
        print(f"Data dir not found: {DATA_DIR}")
        return

    migrated = 0
    skipped = 0

    for item in sorted(DATA_DIR.iterdir()):
        if not item.is_dir():
            continue
        name = item.name
        print(f"\nProcessing: {name}")
        if migrate_one(name):
            migrated += 1
        else:
            skipped += 1

    print(f"\n{'=' * 50}")
    print(f"Done: {migrated} migrated, {skipped} skipped")
    print(f"\n.novel files generated. Old folders remain in data/")
    print(f"Delete old folders after verifying the new format works.")


if __name__ == "__main__":
    main()
