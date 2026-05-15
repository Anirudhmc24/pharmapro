import sqlite3
import csv
import os
from pathlib import Path

# --- Configuration ---
ROOT_DIR = Path(__file__).parent.parent
DB_PATH = ROOT_DIR / "data" / "pharmapro.db"
CSV_PATH = ROOT_DIR / "data" / "master_medicines.csv"

def import_data():
    if not CSV_PATH.exists():
        print(f"Error: CSV file not found at {CSV_PATH}")
        return

    print("Opening database...")
    conn = sqlite3.connect(DB_PATH)
    
    # Create the master_drugs table
    print("Creating master_drugs table...")
    conn.execute("DROP TABLE IF EXISTS master_drugs")
    conn.execute("""
        CREATE TABLE master_drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            manufacturer TEXT,
            composition TEXT,
            mrp REAL,
            description TEXT
        )
    """)
    
    # Fast bulk insert
    print("Importing 250,000+ medicines (this may take a minute)...")
    
    # Map CSV columns to our table
    # Expected columns: id, name, manufacturer_name, type, pack_size_label, price, 
    # primary_albility, secondary_albility, salt_composition, medicine_desc, side_effects, drug_interactions
    
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        batch = []
        count = 0
        for row in reader:
            # Clean data
            name = row.get('name', '').strip()
            manuf = row.get('manufacturer_name', '').strip()
            comp = row.get('salt_composition', '').strip()
            price = row.get('price', '0')
            desc = row.get('medicine_desc', '').strip()
            
            try:
                price = float(price)
            except:
                price = 0.0
                
            batch.append((name, manuf, comp, price, desc))
            count += 1
            
            if len(batch) >= 10000:
                conn.executemany("INSERT INTO master_drugs (name, manufacturer, composition, mrp, description) VALUES (?,?,?,?,?)", batch)
                conn.commit()
                batch = []
                print(f"Progress: {count} rows imported...")
        
        if batch:
            conn.executemany("INSERT INTO master_drugs (name, manufacturer, composition, mrp, description) VALUES (?,?,?,?,?)", batch)
            conn.commit()

    # Create index for fast searching
    print("Creating search index...")
    conn.execute("CREATE INDEX idx_master_name ON master_drugs(name)")
    conn.commit()
    conn.close()
    print(f"Successfully imported {count} medicines!")

if __name__ == "__main__":
    import_data()
