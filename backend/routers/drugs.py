"""
PharmaPro — routers/drugs.py
Drug catalogue, batches, FEFO logic
"""

import json
from pydantic import BaseModel
from backend.database import get_db, row_to_dict, rows_to_list
from backend.models import DrugIn, DrugUpdateIn, BatchIn, DrugLocationIn
from backend.routers.auth import get_current_user
from backend.utils.backup import auto_trigger_backup
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from typing import Optional

router = APIRouter(prefix="/api/drugs", tags=["drugs"])


@router.get("")
def get_drugs(q: str = ""):
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute("""
                SELECT d.*,
                  COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
                  COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0) AS stock_tablets,
                  (SELECT b2.cost_per_strip FROM batches b2 WHERE b2.drug_id=d.id AND b2.full_strips>0 ORDER BY b2.expiry ASC LIMIT 1) as cost_per_strip
                FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
                WHERE d.name LIKE ? OR d.brand LIKE ? OR d.composition LIKE ?
                GROUP BY d.id ORDER BY d.name LIMIT 20""", (like, like, like)).fetchall()
        else:
            rows = conn.execute("""
                SELECT d.*,
                  COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
                  COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0) AS stock_tablets,
                  (SELECT b2.cost_per_strip FROM batches b2 WHERE b2.drug_id=d.id AND b2.full_strips>0 ORDER BY b2.expiry ASC LIMIT 1) as cost_per_strip
                FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
                GROUP BY d.id ORDER BY d.name""").fetchall()
        return rows_to_list(rows)


# ── IMPORTANT: These static routes MUST come before /{drug_id} ──────────────

@router.get("/master_search")
def master_search(q: str = ""):
    """Search the 250k master drug database by name prefix."""
    with get_db() as conn:
        if not q or len(q) < 2:
            # Return empty if query too short
            return []
        like = f"{q}%"
        rows = conn.execute("""
            SELECT name, manufacturer, composition, mrp, hsn, description,
                   indications, side_effects, administration, age_suitability
            FROM master_drugs
            WHERE name LIKE ?
            ORDER BY name
            LIMIT 30
        """, (like,)).fetchall()
        return rows_to_list(rows)


@router.get("/search_by_problem")
def search_by_problem(q: str = ""):
    """Search drugs in the shop database by indications, category, composition, or name."""
    if not q or len(q) < 2:
        return []
    with get_db() as conn:
        like = f"%{q}%"
        rows = conn.execute("""
            SELECT d.*,
              COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0) AS stock_tablets,
              (SELECT MIN(b2.expiry) FROM batches b2 WHERE b2.drug_id=d.id AND b2.full_strips>0) as nearest_expiry,
              (SELECT COUNT(*) FROM trays t2 WHERE t2.drug_id=d.id AND t2.closed=0) as open_trays,
              (SELECT b3.cost_per_strip FROM batches b3 WHERE b3.drug_id=d.id AND b3.full_strips>0 ORDER BY b3.expiry ASC LIMIT 1) as cost_per_strip
            FROM drugs d 
            LEFT JOIN batches b ON b.drug_id=d.id
            WHERE d.indications LIKE ? OR d.category LIKE ? OR d.composition LIKE ? OR d.name LIKE ? OR d.brand LIKE ?
            GROUP BY d.id 
            ORDER BY stock_tablets DESC, d.name 
            LIMIT 30
        """, (like, like, like, like, like)).fetchall()
        return rows_to_list(rows)


@router.get("/master_all")
def master_all(page: int = 1, limit: int = 50):
    """Return master drugs alphabetically, paginated."""
    offset = (page - 1) * limit
    with get_db() as conn:
        rows = conn.execute("""
            SELECT name, manufacturer, composition, mrp, hsn, description,
                   indications, side_effects, administration, age_suitability
            FROM master_drugs
            ORDER BY name
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM master_drugs").fetchone()[0]
        return {"items": rows_to_list(rows), "total": total, "page": page, "limit": limit}


def is_exact_composition_match(comp1: str, comp2: str) -> bool:
    import re
    if not comp1 or not comp2:
        return False
    def normalize(c):
        parts = [p.strip().lower() for p in c.split("+")]
        cleaned = []
        for p in parts:
            p = re.sub(r'[\(\)\-\s\,\/]', '', p)
            cleaned.append(p)
        cleaned.sort()
        return "+".join(cleaned)
    return normalize(comp1) == normalize(comp2)


@router.get("/substitutes")
def get_substitutes_any(drug_id: int = 0, name: str = "", composition: str = ""):
    """
    Smart substitution engine - 3-layer lookup:
      1. Resolve composition from shop DB or master DB
      2. Search shop stock for same-composition alternatives (in-stock first)
      3. Search master DB for alternatives you could order
    Works for ANY drug - no hardcoded dictionary needed.
    """
    resolved_composition = composition.strip()
    resolved_name = name.strip()

    with get_db() as conn:
        # Layer 0: Resolve composition if not provided
        if not resolved_composition and drug_id:
            row = conn.execute(
                "SELECT name, composition FROM drugs WHERE id=?", (drug_id,)
            ).fetchone()
            if row:
                resolved_name = row["name"] or resolved_name
                resolved_composition = row["composition"] or ""

        if not resolved_composition and resolved_name:
            row = conn.execute(
                "SELECT composition FROM master_drugs WHERE name LIKE ? LIMIT 1",
                (f"{resolved_name}%",)
            ).fetchone()
            if row:
                resolved_composition = row["composition"] or ""

        if not resolved_composition:
            return {"drug_name": resolved_name, "composition": None,
                    "exact_in_stock": [], "exact_orderable": [],
                    "comb_in_stock": [], "comb_orderable": []}

        # Extract key active ingredients (strip dose numbers)
        parts = [p.strip() for p in resolved_composition.split("+")]
        key_ingredients = []
        for part in parts[:2]:
            words = part.split()
            clean = " ".join(w for w in words if not any(c.isdigit() for c in w)).strip()
            if len(clean) > 3:
                key_ingredients.append(clean)

        if not key_ingredients:
            return {"drug_name": resolved_name, "composition": resolved_composition,
                    "exact_in_stock": [], "exact_orderable": [],
                    "comb_in_stock": [], "comb_orderable": []}

        conditions = " AND ".join(["composition LIKE ?" for _ in key_ingredients])
        params = [f"%{ing}%" for ing in key_ingredients]

        # Layer 1: Search YOUR SHOP STOCK
        shop_rows = conn.execute(f"""
            SELECT d.id, d.name, d.brand, d.composition, d.mrp_per_strip,
              COALESCE(SUM(b.full_strips * d.tablets_per_strip), 0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t
                        WHERE t.drug_id=d.id AND t.closed=0), 0) AS stock_tablets,
              d.schedule
            FROM drugs d
            LEFT JOIN batches b ON b.drug_id = d.id
            WHERE ({conditions}) AND LOWER(d.name) != LOWER(?)
            GROUP BY d.id
            ORDER BY stock_tablets DESC, d.name
            LIMIT 25
        """, (*params, resolved_name)).fetchall()
        
        in_stock_list = rows_to_list(shop_rows)
        for r in in_stock_list:
            r["available"] = r["stock_tablets"] > 0
            
        exact_in_stock = [r for r in in_stock_list if is_exact_composition_match(resolved_composition, r["composition"])]
        comb_in_stock = [r for r in in_stock_list if not is_exact_composition_match(resolved_composition, r["composition"])]

        # Layer 2: Search MASTER DATABASE (orderable)
        master_rows = conn.execute(f"""
            SELECT name, manufacturer, composition, mrp
            FROM master_drugs
            WHERE ({conditions}) AND LOWER(name) != LOWER(?)
            ORDER BY name LIMIT 40
        """, (*params, resolved_name)).fetchall()
        
        orderable_list = rows_to_list(master_rows)
        
        # Filter out master items that already exist in our shop database (so there's no duplication)
        in_stock_names = {r["name"].lower() for r in in_stock_list}
        orderable_list = [o for o in orderable_list if o["name"].lower() not in in_stock_names]
        
        exact_orderable = [r for r in orderable_list if is_exact_composition_match(resolved_composition, r["composition"])]
        comb_orderable = [r for r in orderable_list if not is_exact_composition_match(resolved_composition, r["composition"])]

        return {
            "drug_name": resolved_name,
            "composition": resolved_composition,
            "key_ingredients": key_ingredients,
            "exact_in_stock": exact_in_stock,
            "exact_orderable": exact_orderable,
            "comb_in_stock": comb_in_stock,
            "comb_orderable": comb_orderable,
        }


@router.get("/{drug_id}")
def get_drug(drug_id: int):
    with get_db() as conn:
        drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=?", (drug_id,)).fetchone())
        if not drug:
            raise HTTPException(404, "Drug not found")
        drug["batches"] = rows_to_list(conn.execute(
            "SELECT * FROM batches WHERE drug_id=? ORDER BY expiry", (drug_id,)).fetchall())
        drug["trays"] = rows_to_list(conn.execute("""
            SELECT t.*, b.batch_no, b.expiry FROM trays t
            JOIN batches b ON b.id=t.batch_id
            WHERE t.drug_id=? AND t.closed=0 ORDER BY b.expiry""", (drug_id,)).fetchall())
        return drug


@router.post("")
def add_drug(drug: DrugIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        # If indications/side_effects not provided, check if matching master drug has them
        ind = drug.indications
        se = drug.side_effects
        adm = drug.administration
        age = drug.age_suitability
        
        if not ind or not se:
            master_info = conn.execute("""
                SELECT indications, side_effects, administration, age_suitability
                FROM master_drugs WHERE name = ?""", (drug.name,)).fetchone()
            if master_info:
                ind = ind or master_info["indications"] or ""
                se = se or master_info["side_effects"] or ""
                adm = adm or master_info["administration"] or ""
                age = age or master_info["age_suitability"] or ""

        # 1. Create the drug in shop database
        cur = conn.execute("""
            INSERT INTO drugs(name,brand,composition,category,schedule,hsn,
            tablets_per_strip,strips_per_box,mrp_per_strip,mrp_per_tablet,
            reorder_level,box_id,offer_type,pack_type,indications,side_effects,
            administration,age_suitability) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (drug.name, drug.brand, drug.composition, drug.category, drug.schedule, drug.hsn,
             drug.tablets_per_strip, drug.strips_per_box, drug.mrp_per_strip, drug.mrp_per_tablet,
             drug.reorder_level, drug.box_id, drug.offer_type, drug.pack_type,
             ind, se, adm, age))
        drug_id = cur.lastrowid
        
        # 2. Sync / Update Master Catalogue (Ensuring every new entry is in master_drugs)
        master_row = conn.execute("SELECT id FROM master_drugs WHERE name = ?", (drug.name,)).fetchone()
        if not master_row:
            conn.execute("""
                INSERT INTO master_drugs(name, manufacturer, composition, mrp, hsn, indications, side_effects, administration, age_suitability)
                VALUES(?,?,?,?,?,?,?,?,?)
            """, (drug.name, drug.brand, drug.composition, drug.mrp_per_strip, drug.hsn, ind, se, adm, age))
        else:
            # Update master entry with latest details if it already exists
            conn.execute("""
                UPDATE master_drugs 
                SET manufacturer=?, composition=?, mrp=?, hsn=?, indications=?, side_effects=?, administration=?, age_suitability=? 
                WHERE name=?
            """, (drug.brand, drug.composition, drug.mrp_per_strip, drug.hsn, ind, se, adm, age, drug.name))

        # 3. Create initial batch if expiry is provided (batch_no is now optional)
        if drug.expiry:
            b_no = drug.batch_no if (drug.batch_no and drug.batch_no.strip()) else "NA"
            batch_cur = conn.execute("""
                INSERT INTO batches(drug_id, batch_no, expiry, full_strips, mrp_per_strip)
                VALUES(?,?,?,?,?)""", 
                (drug_id, b_no, drug.expiry, drug.initial_strips, drug.mrp_per_strip))
            batch_id = batch_cur.lastrowid
            
            if drug.initial_strips > 0:
                conn.execute("INSERT INTO stock_log(drug_id, batch_id, action, qty_change, note) VALUES(?,?,?,?,?)",
                             (drug_id, batch_id, "receive", drug.initial_strips, "Initial stock entry on creation"))

    auto_trigger_backup(background_tasks)
    return {"id": drug_id}


@router.put("/{drug_id}")
def update_drug(drug_id: int, drug: DrugUpdateIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    updates = {k: v for k, v in drug.dict().items() if v is not None}
    if not updates:
        return {"ok": True}
    cols = ", ".join(f"{k}=?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE drugs SET {cols} WHERE id=?", (*updates.values(), drug_id))
        
        # Sync changes to master catalogue if name/brand/comp/mrp were updated
        drug_name = updates.get("name")
        if not drug_name:
            # If name not in updates, get it from DB to identify master row
            row = conn.execute("SELECT name FROM drugs WHERE id=?", (drug_id,)).fetchone()
            drug_name = row["name"] if row else None
            
        if drug_name:
            # Get latest values from shop DB
            d = conn.execute("SELECT name, brand, composition, mrp_per_strip, hsn FROM drugs WHERE id=?", (drug_id,)).fetchone()
            if d:
                hsn_val = d["hsn"] if d["hsn"] else "30049099"
                conn.execute("""
                    UPDATE master_drugs SET manufacturer=?, composition=?, mrp=?, hsn=? WHERE name=?
                """, (d["brand"], d["composition"], d["mrp_per_strip"], hsn_val, d["name"]))

    return {"ok": True}

@router.delete("/{drug_id}")
def delete_drug(drug_id: int, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        # Check if used in bills
        has_bills = conn.execute("SELECT 1 FROM bill_items WHERE drug_id=?", (drug_id,)).fetchone()
        if has_bills:
            raise HTTPException(400, "Cannot delete drug with billing history. Please return stock or set quantity to 0 instead.")
            
        # Delete from associated tables
        conn.execute("DELETE FROM trays WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM stock_log WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM po_items WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM backorders WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM expiry_returns WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM schedule_log WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM batches WHERE drug_id=?", (drug_id,))
        conn.execute("DELETE FROM drugs WHERE id=?", (drug_id,))
    return {"ok": True}


@router.put("/{drug_id}/location")
def update_location(drug_id: int, loc: DrugLocationIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("UPDATE drugs SET box_id=?,zone=? WHERE id=?",
                     (loc.box_id, loc.zone, drug_id))
    return {"ok": True}


@router.get("/{drug_id}/fefo")
def get_fefo_source(drug_id: int):
    with get_db() as conn:
        tray = row_to_dict(conn.execute("""
            SELECT t.*, b.batch_no, b.expiry, d.tablets_per_strip
            FROM trays t JOIN batches b ON b.id=t.batch_id JOIN drugs d ON d.id=t.drug_id
            WHERE t.drug_id=? AND t.closed=0
            ORDER BY b.expiry ASC LIMIT 1""", (drug_id,)).fetchone())
        if tray:
            return {"type": "tray", "source": tray}
        batch = row_to_dict(conn.execute("""
            SELECT b.*, d.tablets_per_strip FROM batches b JOIN drugs d ON d.id=b.drug_id
            WHERE b.drug_id=? AND b.full_strips>0
            ORDER BY b.expiry ASC LIMIT 1""", (drug_id,)).fetchone())
        if batch:
            return {"type": "batch", "source": batch}
        return {"type": "none", "source": None}


@router.get("/{drug_id}/substitutes")
def get_substitutes(drug_id: int):
    with get_db() as conn:
        drug = conn.execute("SELECT composition FROM drugs WHERE id=?", (drug_id,)).fetchone()
        if not drug or not drug["composition"]:
            return []
        
        comp = drug["composition"].strip()
        rows = conn.execute("""
            SELECT d.*, 
              COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0) AS stock_tablets
            FROM drugs d 
            LEFT JOIN batches b ON b.drug_id=d.id
            WHERE d.composition=? AND d.id!=?
            GROUP BY d.id 
            ORDER BY stock_tablets DESC, d.name
            LIMIT 10
        """, (comp, drug_id)).fetchall()
        return rows_to_list(rows)


@router.get("/check_interactions")
def check_interactions(drug_ids: str = ""):
    if not drug_ids:
        return []
    ids = [int(x) for x in drug_ids.split(",") if x.strip().isdigit()]
    if len(ids) < 2:
        return []
        
    with get_db() as conn:
        q = f"SELECT id, name, category, composition FROM drugs WHERE id IN ({','.join(['?']*len(ids))})"
        drugs_list = conn.execute(q, tuple(ids)).fetchall()
        
    # Simple predefined knowledge base of category contraindications
    RULES = [
        ({"nsaid", "ssri"}, "Moderate", "Increased risk of bleeding when NSAIDs are combined with SSRIs."),
        ({"nsaid", "anticoagulant"}, "Major", "High risk of bleeding. Concurrent use of NSAIDs and Anticoagulants is strongly cautioned against."),
        ({"antibiotic", "antacid"}, "Minor", "Antacids can decrease the absorption of antibiotics. Suggest patient separate doses by 2 hours."),
        ({"sildenafil", "nitrate"}, "Critical", "SEVERE: Co-administration can cause a life-threatening drop in blood pressure.")
    ]
    
    alerts = []
    # Check pairwise
    for i in range(len(drugs_list)):
        for j in range(i + 1, len(drugs_list)):
            d1, d2 = drugs_list[i], drugs_list[j]
            c1 = str(d1["category"] or "").lower()
            c2 = str(d2["category"] or "").lower()
            if not c1 or not c2: continue
            
            for (rule_set, severity, msg) in RULES:
                # Check if categories match the rule set
                if any(x in c1 for x in rule_set) and any(x in c2 for x in rule_set):
                    # make sure they are matching different items
                    c1_match = next((x for x in rule_set if x in c1), None)
                    c2_match = next((x for x in rule_set if x in c2 and x != c1_match), None)
                    if c1_match and c2_match:
                        alerts.append({
                            "drugs": [drugs_list[i]["name"], drugs_list[j]["name"]],
                            "severity": severity,
                            "message": msg
                        })
    return alerts

# ── Batches ────────────────────────────────────────────────────────────────────
batches_router = APIRouter(prefix="/api/batches", tags=["batches"])


@batches_router.post("")
def add_batch(b: BatchIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    import sqlite3
    batch_no = b.batch_no if (b.batch_no and b.batch_no.strip()) else "NA"
    with get_db() as conn:
        try:
            cur = conn.execute("""
                INSERT INTO batches(drug_id,batch_no,expiry,full_strips,cost_per_strip,
                                    supplier_id,free_strips,mrp_per_strip,gst_pct)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (b.drug_id, batch_no, b.expiry, b.strips, b.cost_per_strip,
                 b.supplier_id, b.free_strips, b.mrp_per_strip, b.gst_pct))
            batch_id = cur.lastrowid
        except sqlite3.IntegrityError:
            conn.execute("""
                UPDATE batches SET full_strips=full_strips+?, free_strips=free_strips+?,
                                   cost_per_strip=?, mrp_per_strip=?, gst_pct=?, supplier_id=?
                WHERE drug_id=? AND batch_no=?""",
                         (b.strips, b.free_strips, b.cost_per_strip, b.mrp_per_strip, b.gst_pct, b.supplier_id,
                          b.drug_id, batch_no))
            batch_id = conn.execute("SELECT id FROM batches WHERE drug_id=? AND batch_no=?",
                                    (b.drug_id, batch_no)).fetchone()["id"]
        
        # Optionally update box_id
        if b.box_id is not None:
            conn.execute("UPDATE drugs SET box_id=? WHERE id=?", (b.box_id, b.drug_id))

        total_rcv = b.strips + b.free_strips
        conn.execute("INSERT INTO stock_log(drug_id,batch_id,action,qty_change,note) VALUES(?,?,?,?,?)",
                     (b.drug_id, batch_id, "receive", total_rcv, f"Received {b.strips} strips + {b.free_strips} free"))
        
    auto_trigger_backup(background_tasks)
    return {"batch_id": batch_id}


@batches_router.put("/{batch_id}")
def update_batch(batch_id: int, data: dict, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        cost = data.get("cost_per_strip")
        if cost is not None:
            conn.execute("UPDATE batches SET cost_per_strip=? WHERE id=?", (float(cost), batch_id))
    return {"ok": True}

# ── Global Medicine Dictionary ──────────────────────────────────────────────
GLOBAL_MEDICINES = {
    # Pain & Fever
    "calpol": "Paracetamol", "dolo": "Paracetamol", "crocin": "Paracetamol", "pacimol": "Paracetamol",
    "combiflam": "Ibuprofen + Paracetamol", "flexon": "Ibuprofen + Paracetamol", "brufen": "Ibuprofen",
    "voveran": "Diclofenac", "dynapar": "Diclofenac", "zerodol-p": "Aceclofenac + Paracetamol",
    "ultracet": "Tramadol + Paracetamol", "saridon": "Propyphenazone", "disprin": "Aspirin", "meftal": "Mefenamic Acid",

    # Gastric & Acidity
    "pan-40": "Pantoprazole", "pantocid": "Pantoprazole", "pan-d": "Pantoprazole + Domperidone",
    "omez": "Omeprazole", "omee": "Omeprazole", "omez-d": "Omeprazole + Domperidone",
    "rabium": "Rabeprazole", "rabeloc": "Rabeprazole", "rantac": "Ranitidine", "aciloc": "Ranitidine",
    "digene": "Antacid", "gelusil": "Antacid", "ondem": "Ondansetron", "zofer": "Ondansetron",
    "domstal": "Domperidone", "cremaffin": "Liquid Paraffin", "dulcolax": "Bisacodyl",

    # Antibiotics
    "augmentin": "Amoxicillin + Clavulanic Acid", "clavam": "Amoxicillin + Clavulanic Acid",
    "novamox": "Amoxicillin", "azithral": "Azithromycin", "azee": "Azithromycin",
    "taxim-o": "Cefixime", "zifi": "Cefixime", "mahacef": "Cefixime", "monocef": "Ceftriaxone",
    "monocef-o": "Cefpodoxime", "cepodem": "Cefpodoxime", "cifran": "Ciprofloxacin", "ciplox": "Ciprofloxacin",
    "levomac": "Levofloxacin", "oflox": "Ofloxacin", "zenflox": "Ofloxacin", "metrogyl": "Metronidazole",

    # Cardiac & BP
    "telma": "Telmisartan", "telmikind": "Telmisartan", "telvas": "Telmisartan",
    "telma-am": "Telmisartan + Amlodipine", "amlip": "Amlodipine", "amlovas": "Amlodipine",
    "stamlo": "Amlodipine", "cilacar": "Cilnidipine", "concor": "Bisoprolol", "betaloc": "Metoprolol",
    "ecosprin": "Aspirin", "clopilet": "Clopidogrel", "rosuvas": "Rosuvastatin", "lipitor": "Atorvastatin",

    # Diabetes
    "glyciphage": "Metformin", "metffil": "Metformin", "glycomet": "Metformin", "glimi-save": "Glimepiride",
    "amaryl": "Glimepiride", "jalra": "Vildagliptin", "galvus": "Vildagliptin", "januvia": "Sitagliptin",

    # Cold & Allergy
    "allegra": "Fexofenadine", "okacet": "Cetirizine", "alerid": "Cetirizine", "cetzine": "Cetirizine",
    "levocet": "Levocetirizine", "montair-lc": "Montelukast + Levocetirizine", "montek-lc": "Montelukast + Levocetirizine",
    "ascoril": "Terbutaline", "benadryl": "Diphenhydramine", "grilinctus": "Dextromethorphan",
    "sinarest": "Paracetamol + Phenylephrine", "wikoryl": "Paracetamol + Phenylephrine",

    # Vitamins & Skin
    "shelcal": "Calcium + Vitamin D3", "calcirol": "Vitamin D3", "d-rise": "Vitamin D3",
    "neurobion": "Vitamin B-Complex", "becosules": "Vitamin B-Complex", "zincovit": "Multivitamin",
    "candid": "Clotrimazole", "itz": "Itraconazole", "betnovate": "Betamethasone",
}

@router.get("/global_substitutes")
def get_global_substitutes(q: str = ""):
    if not q or len(q) < 2:
        return {"searched_brand": q, "composition": None, "substitutes": []}
    
    q_lower = q.lower().strip()
    composition = GLOBAL_MEDICINES.get(q_lower)
    
    if not composition:
        return {"searched_brand": q, "composition": None, "substitutes": []}
        
    with get_db() as conn:
        comp_query = f"%{composition}%"
        rows = conn.execute("""
            SELECT d.*, 
              COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0) AS stock_tablets
            FROM drugs d 
            LEFT JOIN batches b ON b.drug_id=d.id
            WHERE d.composition LIKE ? OR d.name LIKE ?
            GROUP BY d.id 
            ORDER BY stock_tablets DESC, d.name
            LIMIT 10
        """, (comp_query, comp_query)).fetchall()
        return {
            "searched_brand": q,
            "composition": composition,
            "substitutes": rows_to_list(rows)
        }

# master_search and master_all moved above /{drug_id} to fix routing conflict

ENRICHMENT_STATUS = {
    "running": False,
    "current": 0,
    "total": 0,
    "last_error": None
}

def enrich_inventory_task(force: bool = False):
    global ENRICHMENT_STATUS
    ENRICHMENT_STATUS["running"] = True
    ENRICHMENT_STATUS["last_error"] = None
    try:
        from scripts.populate_indications import run as run_enrichment
        run_enrichment(force=force)
    except Exception as e:
        import traceback
        traceback.print_exc()
        ENRICHMENT_STATUS["last_error"] = str(e)
    finally:
        ENRICHMENT_STATUS["running"] = False

@router.post("/enrich_inventory")
def trigger_enrichment(background_tasks: BackgroundTasks, force: bool = False, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    global ENRICHMENT_STATUS
    if ENRICHMENT_STATUS["running"]:
        return {"ok": False, "message": "Enrichment already running"}
    
    background_tasks.add_task(enrich_inventory_task, force=force)
    return {"ok": True, "message": "Enrichment started in the background"}

@router.get("/enrich_status")
def get_enrichment_status(x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    global ENRICHMENT_STATUS
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM drugs").fetchone()[0]
        missing = conn.execute("""
            SELECT COUNT(*) FROM drugs 
            WHERE indications IS NULL OR indications = '' 
               OR age_suitability IS NULL OR age_suitability = ''
        """).fetchone()[0]
    
    ENRICHMENT_STATUS["total"] = total
    ENRICHMENT_STATUS["current"] = total - missing
    return ENRICHMENT_STATUS


class MasterEnrichIn(BaseModel):
    name: str
    manufacturer: Optional[str] = ""
    composition: Optional[str] = ""


@router.post("/enrich_master_item")
def enrich_master_item(body: MasterEnrichIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    
    # 1. Retrieve Gemini key
    from backend.routers.scan import get_gemini_key
    key = get_gemini_key()
    if not key:
        return {"ok": False, "message": "Gemini API key not configured. Please set your key in Settings."}
        
    # 2. Call gemini to generate clinical details
    from scripts.populate_indications import enrich_medicine
    try:
        data = enrich_medicine(key, body.name, body.manufacturer or "", body.composition or "")
        
        # Prepare age suitability JSON
        age_suitability = json.dumps({
            "child": {"ok": bool(data.get("child_ok", True)), "dose": data.get("child_dose", "")},
            "middle_aged_men": {"ok": bool(data.get("middle_aged_men_ok", True)), "dose": data.get("middle_aged_men_dose", "")},
            "middle_aged_women": {"ok": bool(data.get("middle_aged_women_ok", True)), "dose": data.get("middle_aged_women_dose", "")},
            "elderly_men": {"ok": bool(data.get("elderly_men_ok", True)), "dose": data.get("elderly_men_dose", "")},
            "elderly_women": {"ok": bool(data.get("elderly_women_ok", True)), "dose": data.get("elderly_women_dose", "")}
        })
        
        # 3. Update master_drugs table
        with get_db() as conn:
            conn.execute("""
                UPDATE master_drugs
                SET indications = ?,
                    side_effects = ?,
                    administration = ?,
                    age_suitability = ?
                WHERE LOWER(name) = LOWER(?)
            """, (
                data.get("indications", ""),
                data.get("side_effects", ""),
                data.get("administration", ""),
                age_suitability,
                body.name
            ))
            
            # Also update drugs table if a drug with the exact same name resides in shop stock
            conn.execute("""
                UPDATE drugs
                SET indications = ?,
                    side_effects = ?,
                    administration = ?,
                    age_suitability = ?
                WHERE LOWER(name) = LOWER(?)
            """, (
                data.get("indications", ""),
                data.get("side_effects", ""),
                data.get("administration", ""),
                age_suitability,
                body.name
            ))
            conn.commit()
            
        return {"ok": True, "data": data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "message": str(e)}


class EnrichSingleIn(BaseModel):
    drug_id: int
    name: str
    brand: Optional[str] = ""
    composition: Optional[str] = ""


@router.post("/enrich_single")
def enrich_single_drug(body: EnrichSingleIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    """Enrich a single drug (by id) with AI-generated clinical data. Runs synchronously (fast, 1 API call)."""
    get_current_user(x_token)
    
    from backend.routers.scan import get_gemini_key
    key = get_gemini_key()
    if not key:
        return {"ok": False, "message": "Gemini API key not configured. Go to Settings to add your key."}
    
    from scripts.populate_indications import enrich_medicine
    try:
        data = enrich_medicine(key, body.name, body.brand or "", body.composition or "")
        
        age_suitability = json.dumps({
            "child":           {"ok": bool(data.get("child_ok", True)),             "dose": data.get("child_dose", "")},
            "middle_aged_men": {"ok": bool(data.get("middle_aged_men_ok", True)),   "dose": data.get("middle_aged_men_dose", "")},
            "middle_aged_women":{"ok": bool(data.get("middle_aged_women_ok", True)),"dose": data.get("middle_aged_women_dose", "")},
            "elderly_men":     {"ok": bool(data.get("elderly_men_ok", True)),       "dose": data.get("elderly_men_dose", "")},
            "elderly_women":   {"ok": bool(data.get("elderly_women_ok", True)),     "dose": data.get("elderly_women_dose", "")}
        })
        
        with get_db() as conn:
            conn.execute("""
                UPDATE drugs
                SET indications    = ?,
                    side_effects   = ?,
                    administration = ?,
                    age_suitability = ?
                WHERE id = ?
            """, (
                data.get("indications", ""),
                data.get("side_effects", ""),
                data.get("administration", ""),
                age_suitability,
                body.drug_id
            ))
            
            # Also patch composition if Gemini returned one and ours was empty
            if data.get("composition") and not body.composition:
                conn.execute("UPDATE drugs SET composition = ? WHERE id = ?",
                             (data["composition"], body.drug_id))
            conn.commit()
        
        return {"ok": True, "data": {
            "indications":    data.get("indications", ""),
            "side_effects":   data.get("side_effects", ""),
            "administration": data.get("administration", ""),
            "age_suitability": age_suitability
        }}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "message": str(e)}

