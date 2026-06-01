import sqlite3

db_path = r'c:\Ideas\pharmapro\dist\data\pharmapro.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Check which drugs are assigned to each box
print("=== Drugs currently assigned to specific boxes ===\n")
drugs = conn.execute('''
    SELECT d.id, d.name, d.box_id, b.name as box_name
    FROM drugs d
    LEFT JOIN loc_boxes b ON b.id = d.box_id
    WHERE d.box_id IS NOT NULL
    ORDER BY d.box_id, d.name
''').fetchall()

print(f"Total drugs with a box assigned: {len(drugs)}\n")
for d in drugs:
    print(f"  Drug: {d['name']:<35} | Box ID: {d['box_id']:>3} | Box Name: {d['box_name']}")

conn.close()
