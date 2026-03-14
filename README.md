# 📊 Balance Sheet Integrity (DEMO: Albixhafa.com/balancesheet)

A production-ready, full-stack financial balance sheet and reconciliation application. Built for secure, scalable financial tracking, this app allows teams to import General Ledger (GL) activity, attach supporting documentation, and manage reconciliation workflows seamlessly.

## ✨ Core Functionality

### 🔐 Secure Authentication & User Profiles
* **Access Control:** Dedicated, role-based login system to access the reconciliation portal.
* **Profile Management:** Users can view their specific access levels (e.g., Data Entry & Assembly) and track exactly which entities they manage.
* **Security Enforcement:** The system automatically detects temporary or compromised passwords and intercepts the user, forcing a secure password change before granting access.

### 📥 Strict GL Activity Import
* **Role-Restricted Uploads:** The drag-and-drop CSV import tool is strictly restricted to Assembly and Admin users. 
* **Data Validation:** Enforces a strict 17-column format requiring precise data, including 8-digit transaction dates, exact entity codes, and up to 10 sub-account dimensions.
* **Ledger Protection:** Actively prevents data corruption by rejecting imports into periods that are already closed and fully approved.
* **Audit Feedback:** Provides immediate success metrics detailing rows inserted, duplicates skipped, and any formatting errors.

### ✍️ 3-Tier Reconciliation Workflow
* **Reconciliation Dashboard:** Top-down view of all assigned entities, tracking the active period, last closed period, and current balances.
* **Line-Item Management:** Users can mark specific transactions as cleared and directly upload supporting documentation (receipts, invoices) to individual line items.
* **Staged Approvals:** Enforces a rigid, locked step-by-step workflow: 1. Assembly, 2. Review, and 3. Final Approval.
* **Verification Prompts:** Before any stage is signed off, the user must pass a final verification prompt legally confirming they have reviewed all balances and attached support.
* **Rejection Handling:** Approvers have the authority to reject a ledger, which immediately erases previous signatures and kicks the workflow back. 

### ⚙️ Comprehensive Administration Panel
* **User Management:** Admins can create new users, define roles (Assembler, Reviewer, Approver), edit access, and instantly deactivate accounts.
* **Password Resets:** Admins can trigger password resets for locked-out users, automatically generating secure temporary passwords. 
* **Entity & GL Architecture:** Build the financial structure from scratch, creating new entities with specific 6-character codes. 
* **Dimension Configuration:** Configure up to 10 custom sub-account dimensions when assigning a new General Ledger account. 
* **Structural Integrity:** Because structural changes to the ledger are permanent, the system requires final verification before any new entity or GL is committed to the database.

---

## 🛠️ Tech Stack
* **Framework:** Next.js (App Router)
* **Database:** PostgreSQL
* **Authentication:** NextAuth.js
* **Storage:** S3-Compatible API (AWS, Linode Object Storage, etc.)
* **Deployment:** Docker & Docker Compose (Local & Production ready)
* **Reverse Proxy:** Nginx (for production environments)

---

## 🚀 Quickstart (Local Development)

The easiest way to run this application locally is by using the included Docker development environment. You must have Docker installed on your machine.

Copy and paste this entire block into your terminal to clone the repo, setup the environment, and start the app:

```bash
git clone [https://github.com/albixhafa/balance-sheet-integrity-2026.git](https://github.com/albixhafa/balance-sheet-integrity-2026.git)
cd balance-sheet-integrity-2026
cp .env.example .env
docker compose -f docker-compose.local.yml up -d
