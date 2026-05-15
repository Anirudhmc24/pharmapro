import sys
sys.path.insert(0, 'c:/Ideas/pharmapro')
from backend.database import get_db, rows_to_list, DB_PATH

print("DB Path:", DB_PATH)

# Test 1: master_drugs count
with get_db() as conn:
    count = conn.execute('SELECT COUNT(*) FROM master_drugs').fetchone()[0]
    print('master_drugs count:', count)

# Test 2: master_search query
with get_db() as conn:
    rows = conn.execute(
        "SELECT name, manufacturer, composition, mrp FROM master_drugs WHERE name LIKE ? ORDER BY name LIMIT 5",
        ('Glyc%',)
    ).fetchall()
    print('Search Glyc% results:', len(rows))
    for r in rows:
        print(' -', r[0], '|', r[1])

# Test 3: drugs table (your shop)
with get_db() as conn:
    count = conn.execute('SELECT COUNT(*) FROM drugs').fetchone()[0]
    print('drugs table count (your shop):', count)

# Test 4: FastAPI route simulation
print('\n--- Simulating /drugs/master_search?q=Glyc ---')
with get_db() as conn:
    q = 'Glyc'
    like = f"{q}%"
    rows = conn.execute(
        "SELECT name, manufacturer, composition, mrp, description FROM master_drugs WHERE name LIKE ? ORDER BY name LIMIT 30",
        (like,)
    ).fetchall()
    result = rows_to_list(rows)
    print('Result count:', len(result))
    if result:
        print('First result:', result[0])
