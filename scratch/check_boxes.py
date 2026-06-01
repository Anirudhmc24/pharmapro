import sqlite3

db_path = r'c:\Ideas\pharmapro\dist\data\pharmapro.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

boxes = conn.execute('''
    SELECT b.id, b.name as box_name, c.name as compartment, f.name as fixture
    FROM loc_boxes b
    JOIN loc_compartments c ON c.id = b.compartment_id
    JOIN loc_fixtures f ON f.id = c.fixture_id
    ORDER BY b.id
''').fetchall()

print(f'Total boxes: {len(boxes)}')
print()
for b in boxes:
    bid = b["id"]
    bname = b["box_name"]
    comp = b["compartment"]
    fix = b["fixture"]
    print(f'  Box ID {bid:>3} | Name: {bname:<20} | Compartment: {comp:<15} | Fixture: {fix}')

conn.close()
