"""
PharmaPro — models.py
All Pydantic request/response models
"""

from pydantic import BaseModel
from typing import Optional, List


class ShopConfigIn(BaseModel):
    name: str; owner: str = ""; phone: str = ""; email: str = ""; address: str = ""
    gstin: str = ""; licence: str = ""; state: str = "KA"; gst_slab: str = "12"
    strategy: str = "alpha"; alpha_by_brand: bool = False
    alpha_within_zone: bool = True; auto_reoptimise: bool = True
    fefo: bool = True; top_up_tray: bool = True
    broken_strip_alert: int = 2; expiry_warn_months: int = 3
    print_tray_label: bool = True; schedule_warning: bool = True
    require_batch_on_sale: bool = True; low_stock_reorder: bool = True
    counter_rack: str = "R1"; eye_level_shelf: str = "S5"
    fast2sms_key: str = ""
    gemini_api_key: str = ""
    backup_enabled: bool = False; gdrive_folder_id: str = ""


class DrugIn(BaseModel):
    name: str; brand: str = ""; composition: str = ""; category: str = ""
    schedule: str = "OTC"; hsn: str = "30049099"
    tablets_per_strip: int = 10; strips_per_box: int = 10
    mrp_per_strip: float = 0; mrp_per_tablet: float = 0
    reorder_level: int = 20; box_id: Optional[int] = None; zone: str = "B"
    offer_type: str = ""; pack_type: str = "Strip"
    indications: Optional[str] = None
    side_effects: Optional[str] = None
    administration: Optional[str] = None
    # Fields for initial stock entry
    batch_no: Optional[str] = None
    expiry: Optional[str] = None
    initial_strips: int = 0


class DrugUpdateIn(BaseModel):
    name: Optional[str] = None; brand: Optional[str] = None
    composition: Optional[str] = None; category: Optional[str] = None
    schedule: Optional[str] = None; mrp_per_strip: Optional[float] = None
    mrp_per_tablet: Optional[float] = None; reorder_level: Optional[int] = None
    box_id: Optional[int] = None; zone: Optional[str] = None
    offer_type: Optional[str] = None; pack_type: Optional[str] = None
    indications: Optional[str] = None
    side_effects: Optional[str] = None
    administration: Optional[str] = None


class BatchIn(BaseModel):
    drug_id: int; batch_no: str; expiry: str
    strips: int = 1; cost_per_strip: float = 0; supplier_id: Optional[int] = None
    free_strips: int = 0; mrp_per_strip: Optional[float] = None
    gst_pct: float = 0; box_id: Optional[int] = None


class TrayIn(BaseModel):
    drug_id: int; batch_id: int; tablets_remaining: int; box_id: Optional[int] = None


class BillItemIn(BaseModel):
    drug_id: int; tablets_qty: int
    batch_id: Optional[int] = None; tray_id: Optional[int] = None


class BillIn(BaseModel):
    customer_id: Optional[int] = None; patient_name: str = ""
    doctor: str = ""; rx_no: str = ""; rx_image_path: str = ""
    discount_pct: float = 0; payment_mode: str = "Cash"
    points_redeemed: int = 0
    items: List[BillItemIn]


class CustomerIn(BaseModel):
    name: str; phone: str = ""; dob: str = ""


class SupplierIn(BaseModel):
    name: str; contact: str = ""; phone: str = ""; email: str = ""; gstin: str = ""


class LayoutSaveIn(BaseModel):
    layout_json: str  # We will just post the full stringified tree for simplicity

class DrugLocationIn(BaseModel):
    box_id: int; zone: str = ""


class LoginIn(BaseModel):
    username: str; password: str


class UserIn(BaseModel):
    username: str; display_name: str; password: str; role: str = "pharmacist"


class POItemIn(BaseModel):
    drug_id: int; qty_strips: int; rate_per_strip: float = 0
    discount_pct: float = 0; gst_pct: float = 0


class POIn(BaseModel):
    supplier_id: Optional[int] = None
    notes: str = ""
    expected_delivery: Optional[str] = None
    items: List[POItemIn]


class POReceiveItemIn(BaseModel):
    po_item_id: int; received_strips: int; batch_no: str; expiry: str; cost_per_strip: float = 0


class POReceiveIn(BaseModel):
    items: List[POReceiveItemIn]


class ExpiryReturnIn(BaseModel):
    drug_id: int; batch_id: int; supplier_id: Optional[int] = None
    strips_returned: int; reason: str = "expiry"


class ScanIn(BaseModel):
    image_b64: str
    mime: str = "image/jpeg"
    mode: str = "strip"


class BackorderIn(BaseModel):
    drug_id: int
    customer_name: str
    phone: str
    qty_strips: int = 1
    notes: str = ""


class BillReturnItemIn(BaseModel):
    bill_item_id: int
    drug_id: int
    batch_id: Optional[int] = None
    tablets_qty: int


class BillReturnIn(BaseModel):
    bill_id: int
    items: List[BillReturnItemIn]
    reason: str = ""
    refund_mode: str = "Cash"


class CreditCollectIn(BaseModel):
    amount: float
    note: str = ""
