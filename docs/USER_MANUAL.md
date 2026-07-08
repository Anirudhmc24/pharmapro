# PharmaPro User Manual

Welcome to **PharmaPro**, your comprehensive tool for pharmacy billing and inventory management.

## Table of Contents
1. [Initial Setup](#1-initial-setup)
2. [Managing Inventory & POs](#2-managing-inventory--pos)
3. [Billing & POS](#3-billing--pos)
4. [Returns & Refunds](#4-returns--refunds)
5. [Reports & Compliance](#5-reports--compliance)
6. [Settings & Customization](#6-settings--customization)

---

## 1. Initial Setup

### Logging In
1. Double-click `PharmaPro.exe`.
2. The application will start and automatically open your default browser.
3. Login with your credentials (Default: `admin` / `admin123`).
4. On your first login, go to **Settings** to configure your shop name, GSTIN, and address. This information will appear on your invoices.

### Managing Staff
If you are an administrator, you can add your staff members in the **Staff** section. You can assign them roles like `Pharmacist` or `Admin`.

---

## 2. Managing Inventory & POs

### Adding a New Medicine & Master Database Search
1. Go to the **Inventory** tab.
2. Click **+ Add Medicine**.
3. **Master Database Autofill:** Instead of typing everything manually, use the **Search Master Database** bar at the top of the form. Type the name (e.g., "Augmentin") and select it. The system will instantly auto-fill the Composition, Manufacturer, and MRP from the 253,000+ master catalogue.
4. **Dynamic Packaging Units:** From the "Packaging Type" dropdown, select whether the product is measured in **Strips, Bottles, Tubes, Pieces, or Boxes**. This is vital for correctly billing cosmetics and syrups!
5. Set a **Reorder Level**. The system will alert you on the dashboard when stock falls below this number.

### Automated Purchase Orders (WhatsApp)
1. Go to the **Purchase Orders** tab and click **Create PO**.
2. Add medicines from your catalogue that are low on stock.
3. Select your Supplier.
4. Click **Save & Send**.
5. A popup will appear with a green **💬 Send via WhatsApp** button. Clicking this will instantly open WhatsApp Desktop and pre-fill a formatted order message to your supplier!

### Adding Stock (Batches)
1. Search for a medicine in the inventory list.
2. Click **Add Batch**.
3. Enter the **Batch Number**, **Expiry Date**, and quantity received.
4. **FEFO Logic**: PharmaPro automatically tracks which batch expires first and suggests selling it before newer stock.

---

## 3. Billing & POS

The Billing screen is designed for speed and clinical safety.

1. Go to **Billing POS**.
2. **Search**: Start typing the medicine name or scan a barcode.
3. **Select Item**: Use the arrow keys or mouse to select the drug. The system will automatically pick the batch with the nearest expiry.
4. **"Just-In-Time" Auto-Add**: If you type a medicine that is NOT in your shop, the dropdown will show a special `🌐 Found in Master Database` section at the bottom. Clicking it will instantly create the medicine in your active inventory and add it to your bill—saving you from going back to the Inventory tab!
5. **Substitutions & Alternatives**: If a searched brand is out of stock, click the **View Alts** button. The system dynamically reads the chemical composition and lists cheaper or in-stock alternatives.
5. **Drug Interactions**: If you add two medicines to the same bill that have known negative interactions, the system will display a bright red clinical warning.
6. **BOGO Schemes**: If a drug is marked under a Buy-One-Get-One scheme, the billing engine will calculate the free items automatically.
7. **Customer Details**: Add a customer's phone number to track loyalty points.
8. **WhatsApp PDF Invoice Sharing**: After saving, click the green **💬 WhatsApp** button.
   - On **Mobile**: PharmaPro will automatically download the invoice PDF from the backend, generate a secure attachment link via a custom `FileProvider` Android bridge, and share the PDF directly to a new WhatsApp chat with the customer.
   - On **Desktop**: PharmaPro fallback logic instantly redirects to a WhatsApp click-to-chat web query with the custom message pre-filled.
9. **Finalize**: Click **Print Bill & Save** to deduct stock and log revenue. Alternatively, click **Generate Challan** to print a delivery challan without finalizing the tax invoice.

---

## 4. Returns & Refunds

1. Go to **Bill History**.
2. Find the bill you wish to return and click **↩ Return**.
3. Select the items and the quantity being returned.
4. Choose the refund mode (Cash, UPI, etc.).
5. **Stock Restoration**: The system will automatically add the returned items back into your inventory (usually as an open tray).

---

## 5. Reports & Compliance

### Dashboard
The Dashboard gives you a real-time view of:
- Today's Revenue and Bill Count.
- **Low Stock Alerts**: Items needing immediate reordering.
- **Expiry Alerts**: Items expiring in the next 3 months.

### GSTR-1 Report
Go to **Reports > GSTR-1**. This report groups your sales by HSN code and calculates the tax breakdown, making it easy to file your GST returns.

---

## 6. Settings & Customization

- **GST Slab**: Set your default GST percentage.
- **Expiry Warning**: Choose how many months in advance you want to be warned about expiring stock.
- **SMS Notifications**: If you have a Fast2SMS API key, enter it here to notify customers when out-of-stock items are restocked.

## 7. Smart Shop Layout Mapping

1. Go to the **Locations** tab.
2. Create **Fixtures** (e.g., "Wall Rack A", "Refrigerator").
3. Add **Compartments** (e.g., "Shelf 1", "Shelf 2") and **Boxes** inside those fixtures.
4. When adding a batch of medicine, assign it to a Box. During billing, the system will tell your staff exactly where to physically find the medicine in the shop!

---

**Need Help?**
Contact your system administrator or refer to the technical documentation in the `docs/` folder.

## 🌟 Why Choose PharmaPro?
PharmaPro combines a powerful **inventory engine**, **intelligent billing**, and **automation** to save time, reduce errors, and improve patient care.

### Key Benefits
- **Rapid Invoice Scanning** – Upload multiple invoice images at once; the system extracts batch numbers, expiry dates, and auto‑adds new medicines.
- **One‑Click WhatsApp Sharing** – After billing, send the bill instantly via WhatsApp and automatically store customer contact details.
- **Smart Stock Management** – FEFO batch handling, low‑stock alerts, and expiry warnings keep your pharmacy compliant.
- **Master Database Auto‑Fill** – Access a catalog of >250 k medicines to auto‑populate composition, manufacturer, and pricing.
- **Dynamic Layout Mapping** – Map physical shelves, boxes, and fixtures for fast item retrieval.
- **Regulatory Compliance** – Built‑in GSTR‑1 reports, batch traceability, and drug‑interaction warnings.
- **Portable Executable** – A single‑file Windows `.exe` for easy distribution, no Python installation required.

### Who Benefits?
- Small independent pharmacies looking for an affordable, all‑in‑one solution.
- Chain stores that need centralized inventory with per‑store POS.
- Pharmacists who want to reduce manual entry and focus on patient counseling.

## 🚀 Getting Started
1. Download the latest `PharmaPro.exe` from the `dist/` folder.
2. Run the installer (no admin rights needed).
3. Follow the **Initial Setup** steps in this manual to configure your shop.

For a full technical walk‑through, see `MASTER_WALKTHROUGH.md`.

## 🏗️ Build & Feature Overview
PharmaPro is built using a modern Electron‑based Windows executable packaged with PyInstaller. The source code resides in the `src/` directory and includes:
- **Backend**: FastAPI services handling inventory, billing, and customer data.
- **Frontend**: HTML/CSS/JS UI with dynamic React‑like components.
- **CI/CD**: GitHub Actions workflow targeting Node.js 24 for reliable builds.
- **Key Features**: Multi‑image invoice scanning, WhatsApp bill sharing, automated PO generation, FEVO stock handling, and more.

These features empower pharmacies to streamline operations, reduce manual entry errors, and improve patient service. The single‑file `PharmaPro.exe` can be distributed to any Windows machine without additional dependencies.
