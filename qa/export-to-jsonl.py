#!/usr/bin/env python3
"""Convert a Secure Access Activity Search export (.xlsx or .csv) to JSON Lines.

    python3 qa/export-to-jsonl.py <export.xlsx|export.csv> [qa/data/events.jsonl]

Empty cells are dropped; the header's byte-order mark is stripped.
"""
import csv, datetime, json, os, sys

def rows(path):
    if path.lower().endswith(".csv"):
        with open(path, newline="", encoding="utf-8-sig") as handle:
            yield from csv.DictReader(handle)
        return
    import openpyxl
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    cells = sheet.iter_rows(values_only=True)
    # Some exports carry the byte-order mark as text ("﻿" or its
    # mis-decoded "ï»¿") on the first header cell.
    header = [str(c or "").replace("﻿", "").replace("ï»¿", "") for c in next(cells)]
    for row in cells:
        yield dict(zip(header, row))

def main():
    source = sys.argv[1]
    target = sys.argv[2] if len(sys.argv) > 2 else "qa/data/events.jsonl"
    os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
    count = 0
    with open(target, "w") as out:
        for row in rows(source):
            record = {}
            for key, value in row.items():
                if value in (None, ""):
                    continue
                if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
                    value = value.isoformat()
                record[key] = value
            if record:
                out.write(json.dumps(record) + "\n")
                count += 1
    print(f"{count} events -> {target}")

if __name__ == "__main__":
    main()
