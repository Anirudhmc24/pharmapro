# API Reference

PharmaPro provides a RESTful API to manage pharmacy operations. All endpoints are prefixed with `/api`.

## Authentication

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/auth/login` | `POST` | Authenticate user and receive an `X-Token`. |
| `/auth/logout` | `POST` | Invalidate current session. |
| `/auth/me` | `GET` | Get current logged-in user details. |

*Note: Most endpoints require the `X-Token` header for authentication.*

## Inventory & Drugs

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/drugs` | `GET` | List drugs or search by name/composition. |
| `/drugs` | `POST` | Add a new drug to the catalogue. |
| `/drugs/{id}` | `GET` | Get detailed info for a specific drug. |
| `/batches` | `POST` | Add a new stock batch for a drug. |
| `/inventory` | `GET` | Get a summary of all stock and nearest expiry. |
| `/expired` | `GET` | List all expired or near-expiry stock. |

## Billing & POS

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/bills` | `POST` | Generate a new POS invoice and deduct stock. |
| `/bills` | `GET` | Retrieve bill history. |
| `/bills/{id}` | `GET` | Get detailed breakdown of an invoice. |
| `/returns` | `POST` | Process a sales return and restore stock. |

## Dashboard & Reports

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/dashboard` | `GET` | Get high-level stats, revenue, and low-stock alerts. |
| `/reports/gstr1` | `GET` | Generate GST compliance report grouped by HSN. |

## Master Data

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/customers` | `GET/POST` | Manage customer records and loyalty points. |
| `/suppliers` | `GET/POST` | Manage supplier records and outstanding dues. |
| `/users` | `GET/POST` | Manage staff accounts (Admin only). |
| `/config` | `GET/POST` | Update shop settings and configuration. |
