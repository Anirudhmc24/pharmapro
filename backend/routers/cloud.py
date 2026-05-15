"""
PharmaPro — routers/cloud.py
Cloud drug info lookup using DuckDuckGo Instant Answer API.

Strategy:
  - Indian brand names (Glycomet, Augmentin) return nothing from DDG.
  - Generic/composition names (Metformin, Amoxicillin) return rich info.
  - So we look up the COMPOSITION from master_drugs, then query DDG with that.
  - This gives pharmacists real clinical context (uses, side effects, class).
"""

import urllib.parse
import urllib.request
import json

from fastapi import APIRouter
from backend.database import get_db, rows_to_list

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


def _ddg_lookup(query: str) -> dict:
    """
    Query DuckDuckGo Instant Answer API.
    Returns a dict with heading, abstract, and source_url.
    Works well for generic drug names / compositions.
    """
    try:
        q = urllib.parse.quote(query)
        url = (
            "https://api.duckduckgo.com/?q=" + q +
            "&format=json&no_html=1&skip_disambig=1"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "PharmaPro/2.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            data = json.loads(r.read())

        abstract = data.get("AbstractText", "").strip()
        heading  = data.get("Heading", "").strip()
        source   = data.get("AbstractURL", "").strip()

        return {
            "heading":  heading,
            "abstract": abstract,
            "source":   source,
            "found":    bool(abstract),
        }
    except Exception:
        return {"heading": "", "abstract": "", "source": "", "found": False}


@router.get("/drug_info")
def drug_info(name: str = "", composition: str = ""):
    """
    Look up clinical info for a medicine.
    Tries composition first (more reliable), then brand name.
    """
    if not name and not composition:
        return {"found": False, "abstract": "", "heading": "", "source": ""}

    # Step 1: If we have a composition, use its first active ingredient
    if composition:
        # e.g. "Metformin Hydrochloride 500mg + Glipizide 5mg" -> "Metformin Hydrochloride"
        first_ingredient = composition.split("+")[0].strip()
        # Strip dose: "Metformin Hydrochloride 500mg" -> "Metformin Hydrochloride"
        words = first_ingredient.split()
        clean = " ".join(w for w in words if not any(c.isdigit() for c in w))
        result = _ddg_lookup(clean.strip())
        if result["found"]:
            result["lookup_used"] = clean.strip()
            return result

    # Step 2: Try the brand name (usually fails for Indian brands, but worth trying)
    if name:
        result = _ddg_lookup(name)
        if result["found"]:
            result["lookup_used"] = name
            return result

    # Step 3: Nothing found
    return {
        "found": False,
        "heading": "",
        "abstract": "",
        "source": "",
        "lookup_used": composition or name,
    }


@router.get("/drug_info_by_id")
def drug_info_by_id(drug_id: int = 0):
    """Look up cloud info for a drug already in the shop catalogue."""
    if not drug_id:
        return {"found": False}

    with get_db() as conn:
        row = conn.execute(
            "SELECT name, composition FROM drugs WHERE id=?", (drug_id,)
        ).fetchone()

    if not row:
        return {"found": False}

    return drug_info(name=row["name"] or "", composition=row["composition"] or "")
