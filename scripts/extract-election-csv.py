"""
extract-election-csv.py — Extracts the 3 columns we need (BLOCKID, USPresVp20_D,
USPresVp20_R) from the large Excel file and writes a lightweight CSV.

The xlsx library in Node.js chokes on the 253K-row file; Python's openpyxl
handles it with read_only mode for streaming. This script runs once to produce
a CSV that the Node.js join script can process quickly.

Usage: python3 scripts/extract-election-csv.py
"""

import openpyxl
import csv
import os

EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'data',
    'mo_elections_16_20_block_official',
    '2018 - 2020 Block Assign with Election Results.xlsx')
CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data',
    'elections', 'mo-2020-pres-by-block.csv')

print(f'Reading {EXCEL_PATH}...')
print('(Using read_only mode for streaming — this handles large files efficiently)')

# Open in read_only mode for memory efficiency on large files
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
ws = wb['BlockAssign_ST29_MO_VTD']

# Find column indices from header row
headers = None
col_blockid = None
col_dem = None
col_rep = None

os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)

with open(CSV_PATH, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['block_geoid', 'dem_votes', 'rep_votes'])

    row_count = 0
    for row in ws.iter_rows(values_only=True):
        if headers is None:
            # First row is headers
            headers = list(row)
            col_blockid = headers.index('BLOCKID')
            col_dem = headers.index('USPresVp20_D')
            col_rep = headers.index('USPresVp20_R')
            print(f'Found columns: BLOCKID={col_blockid}, USPresVp20_D={col_dem}, USPresVp20_R={col_rep}')
            continue

        block_id = str(row[col_blockid] or '')
        dem = row[col_dem] or 0
        rep = row[col_rep] or 0

        if len(block_id) >= 11:
            writer.writerow([block_id, dem, rep])
            row_count += 1

        if row_count % 50000 == 0 and row_count > 0:
            print(f'  Processed {row_count} rows...')

wb.close()
print(f'\nWrote {row_count} rows to {CSV_PATH}')
print('Done! Now run: node scripts/join-election-to-tracts.cjs')
