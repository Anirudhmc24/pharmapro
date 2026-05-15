"""
PharmaPro — routers/config.py
Shop config + rack management
"""

from fastapi import APIRouter, Header, BackgroundTasks
from typing import Optional, List

from backend.database import get_db, rows_to_list
from backend.models import ShopConfigIn
from backend.routers.auth import get_current_user
from backend.utils.backup import trigger_backup_task

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config")
def get_config():
    with get_db() as conn:
        rows = conn.execute("SELECT key,value FROM shop_config").fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
        cfg["setup_done"] = "setup_done" in cfg
        return cfg


@router.post("/config")
def save_config(cfg: ShopConfigIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        for k, v in cfg.dict().items():
            if v is not None:
                conn.execute("INSERT OR REPLACE INTO shop_config(key,value) VALUES(?,?)", (k, str(v)))
        conn.execute("INSERT OR REPLACE INTO shop_config(key,value) VALUES('setup_done','1')")
    return {"ok": True}


@router.post("/config/backup/manual")
def manual_backup(background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        rows = conn.execute("SELECT key,value FROM shop_config").fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
    
    if cfg.get("backup_enabled") == "True" and cfg.get("gdrive_folder_id"):
        background_tasks.add_task(trigger_backup_task, cfg["gdrive_folder_id"])
        return {"ok": True, "message": "Backup started in background"}
    return {"ok": False, "message": "Backup not configured or disabled"}


@router.get("/layout")
def get_layout():
    with get_db() as conn:
        fixtures = rows_to_list(conn.execute("SELECT * FROM loc_fixtures").fetchall())
        comps = rows_to_list(conn.execute("SELECT * FROM loc_compartments").fetchall())
        boxes = rows_to_list(conn.execute("SELECT * FROM loc_boxes").fetchall())
        
        # Build tree
        comp_map = {}
        for b in boxes:
            cid = b["compartment_id"]
            if cid not in comp_map: comp_map[cid] = []
            comp_map[cid].append(b)
            
        fix_map = {}
        for c in comps:
            fid = c["fixture_id"]
            if fid not in fix_map: fix_map[fid] = []
            c["boxes"] = comp_map.get(c["id"], [])
            fix_map[fid].append(c)
            
        for f in fixtures:
            f["compartments"] = fix_map.get(f["id"], [])
            
        return fixtures


import json
from backend.models import LayoutSaveIn

@router.post("/layout")
def save_layout(data: LayoutSaveIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    tree = json.loads(data.layout_json)
    with get_db() as conn:
        for f in tree:
            fid = f.get("id")
            if fid:
                conn.execute(
                    "UPDATE loc_fixtures SET name=?, type=?, x_pos=?, y_pos=?, width=?, height=?, color=? WHERE id=?",
                    (f["name"], f["type"], f.get("x_pos", 0), f.get("y_pos", 0), f.get("width", 100), f.get("height", 100), f.get("color", "#fff"), fid)
                )
            else:
                cur = conn.execute(
                    "INSERT INTO loc_fixtures(name,type,x_pos,y_pos,width,height,color) VALUES(?,?,?,?,?,?,?)",
                    (f["name"], f["type"], f.get("x_pos", 0), f.get("y_pos", 0), f.get("width", 100), f.get("height", 100), f.get("color", "#fff"))
                )
                fid = cur.lastrowid
            
            for i, c in enumerate(f.get("compartments", [])):
                cid = c.get("id")
                if cid:
                    conn.execute("UPDATE loc_compartments SET name=?, type=?, position=? WHERE id=?", 
                                 (c["name"], c["type"], i, cid))
                else:
                    cur = conn.execute("INSERT INTO loc_compartments(fixture_id,name,type,position) VALUES(?,?,?,?)",
                                       (fid, c["name"], c["type"], i))
                    cid = cur.lastrowid
                
                for b in c.get("boxes", []):
                    bid = b.get("id")
                    if bid:
                        conn.execute("UPDATE loc_boxes SET name=?, capacity=? WHERE id=?", (b["name"], b.get("capacity", 0), bid))
                    else:
                        conn.execute("INSERT INTO loc_boxes(compartment_id,name,capacity) VALUES(?,?,?)", (cid, b["name"], b.get("capacity", 0)))
    return {"ok": True}

