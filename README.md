# PharmaPro — The Smart Pharmacy Management System

PharmaPro is a high-performance, completely offline retail pharmacy management system designed to bring **enterprise-level intelligence** to independent pharmacies. It acts as your all-in-one POS, intelligent inventory tracker, and automated purchasing assistant.

![PharmaPro Banner](https://via.placeholder.com/1200x400/00c896/080d18?text=PharmaPro+-+Smart+Pharmacy+System)

## 🌟 Why Choose PharmaPro?

Unlike traditional software that forces you to manually type in every medicine, or cloud software that charges you expensive monthly fees, PharmaPro gives you the best of both worlds.

### 1. 🌐 The 250k+ "Just-In-Time" Master Catalogue
PharmaPro comes pre-loaded with a hidden master database of over 253,000 Indian medicines.
*   **Zero Typing:** Start typing any medicine in the Billing POS. If it's not in your shop, it instantly searches the Master Database.
*   **1-Click Auto-Add:** Click any master result, and the system instantly imports the composition, manufacturer, and MRP into your active inventory.
*   **Fully Offline:** No internet connection required. Lightning-fast search speeds.

### 2. 🧴 Beyond Strips (FMCG & Cosmetics Ready)
Traditional software forces you to measure everything in "Strips" and "Tablets". 
*   **Dynamic Packaging Units:** PharmaPro natively supports `Pieces`, `Bottles`, `Tubes`, and `Boxes`. 
*   Now you can accurately bill baby diapers, cough syrups, and cosmetic face washes without breaking your accounting math.

### 3. 🧠 Enterprise Generic Substitution (The 3-Layer Engine)
Clear out your dead stock faster and never lose a customer.
*   If a customer asks for an expensive brand you don't carry, click **"View Alts"**.
*   PharmaPro's algorithm dynamically strips out dosages and matches exact chemical salts (e.g., matching *Crocin* to *Dolo*).
*   It searches your shop's inventory *first*, automatically suggesting the cheapest or highest-stock alternative you currently own.

### 4. 🗺️ Smart Shop Layout Mapping
Drastically reduce training time for new pharmacy staff.
*   Visually map out your store's Fixtures, Racks, and Boxes.
*   When billing, the POS tells you exactly where to physically locate the medicine (e.g., *Wall Rack A -> Box 12*).

### 5. 💬 WhatsApp PO Automation
*   Generate Purchase Orders automatically based on Reorder Levels.
*   One-click dispatch directly to your supplier's WhatsApp number without ever leaving the application.

---

## 📖 Documentation

For detailed guides, please refer to the following:

- **[Installation Guide](docs/INSTALLATION.md)**: Get the app up and running in 5 minutes.
- **[User Manual](docs/USER_MANUAL.md)**: A complete walkthrough for pharmacists and shop owners.
- **[User Testing Guide](docs/USER_TESTING_GUIDE.md)**: A structured guide for beta testing.

## 🛠️ Quick Start

1. Download the latest compiled release: `PharmaPro.exe`.
2. Double-click **`PharmaPro.exe`**.
3. The app will automatically generate its local database and open your browser at **`http://localhost:8503`**.
4. Login with the default credentials: `admin` / `admin123`.

## 🔐 Distribution & Scale

Currently, PharmaPro is distributed as a **single-store offline executable**. 
For deployment to multiple shops:
- Simply share the `.exe` file. Each pharmacy will have its own isolated, offline database with zero recurring cloud costs.
- *Cloud SaaS transition is fully architected and available as an upgrade path for multi-tenant subscription models.*
