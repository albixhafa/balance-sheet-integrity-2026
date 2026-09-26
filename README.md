# 📊 Balance Sheet Integrity

A full-stack balance sheet reconciliation application. Teams import General Ledger (GL) activity, clear line items against supporting documentation, and sign off each account through a three-step review with a complete audit trail. (Demo: albixhafa.com/balancesheet)

## ✨ Core Functionality

### 🔐 Secure Authentication & User Profiles
* **Server-side sessions:** Sign-in issues a random session token; only its hash is stored. Sessions expire after 8 hours (1 hour idle), and deactivating a user or resetting their password signs them out immediately.
* **Account protection:** Accounts lock after repeated failed sign-ins. Passwords must be 10+ characters and are hashed with bcrypt.
* **Profile Management:** Users see their role, their access level and the entities they are assigned to.
* **Forced password change:** Temporary or reset passwords must be replaced before the user can reach anything else.

### 📥 Strict GL Activity Import
* **Role-Restricted Uploads:** CSV import is limited to Assembly and Admin users, for the entities they are assigned to.
* **Server-side validation:** Enforces the 17-column format (8-digit dates, exact entity codes, up to 10 sub-account dimensions) and parses amounts exactly, including thousands separators and negatives in parentheses.
* **All-or-nothing:** A file either loads completely or not at all, with a list of every rejected row and why. Duplicates are skipped and reported.
* **Ledger Protection:** Imports into periods that are already approved are refused.

### ✍️ 3-Tier Reconciliation Workflow
* **Reconciliation Dashboard:** All assigned entities with the active period, last approved period and current balances. Close Status shows real progress across every GL.
* **Line-Item Management:** Mark transactions as cleared and attach supporting documents (PDF, images, Office files, CSV, email; up to 10 MB). Files are stored privately and only served to users with access to that entity.
* **Staged Approvals:** 1. Assembly, 2. Review, 3. Final Approval, in order, by **three different people**. Admins can stand in for any role, but still sign only one step per reconciliation.
* **Verification Prompts:** Each sign-off requires confirming that balances and support have been reviewed.
* **Rejection Handling:** Reviewers and approvers can reject with a required reason, which clears the signatures and sends the account back to Assembly.
* **Reopen:** Admins can reopen an approved period with a reason; items that were rolled forward move back.
* **Activity history:** Every account shows who did what and when.

### ⚙️ Comprehensive Administration Panel
* **User Management:** Create users, set roles (Assembler, Reviewer, Approver, Admin), assign entities, set read-only access, and deactivate accounts.
* **Password Resets:** Unlock users and issue cryptographically random temporary passwords for any account.
* **Entity & GL Architecture:** Create entities (6-character codes) and GL accounts with up to 10 sub-account dimensions; edit descriptions and deactivate them later.
* **Audit Log:** Every change (sign-ins, sign-offs, rejections, imports, attachments, admin actions) is recorded in an append-only log.

### 🛡️ Integrity Guarantees
* Every action is authorised on the server: role, entity assignment and read-only status are checked on each request, never trusted from the browser.
* Workflow rules live in a single function used both to show buttons and to authorise the action, so the UI and the server cannot disagree.
* Money is stored and summed as integer cents.
* Changes to an account are serialised with a per-GL database lock, so two people acting at the same moment cannot both win.
* Each change and its audit entry are written in the same transaction.

---

## 🛠️ Tech Stack
* **Framework:** Next.js 16 (App Router, Server Actions)
* **Database:** PostgreSQL with Prisma 7
* **Authentication:** Custom server-side sessions (bcrypt, hashed session tokens, HttpOnly cookies)
* **Storage:** Private file volume for attachments, served through an access-checked route
* **Deployment:** Docker (multi-stage image, non-root) & Docker Compose
* **Reverse Proxy:** Nginx (TLS termination in production)

---

## 🚀 Quickstart (Local Development)

Requires Docker.

```bash
git clone https://github.com/albixhafa/balance-sheet-integrity-2026.git
cd balance-sheet-integrity-2026
cp .env.example .env   # then set POSTGRES_PASSWORD
docker compose -f docker-compose.local.yml up -d --build
```

Create the first admin (prints a one-time password you will replace at first sign-in):

```bash
docker compose -f docker-compose.local.yml exec app sh -c 'ADMIN_EMAIL=you@example.com node scripts/create-admin.mjs'
```

Then open http://localhost:3000/balancesheet.

![Screenshot 1](images/Screenshot1.png)
![Screenshot 2](images/Screenshot2.png)
![Screenshot 3](images/Screenshot3.png)
![Screenshot 4](images/Screenshot4.png)
![Screenshot 5](images/Screenshot5.png)
![Screenshot 5.1](images/Screenshot5.1.png)
![Screenshot 6](images/Screenshot6.png)
![Screenshot 7](images/Screenshot7.png)
![Screenshot 8](images/Screenshot8.png)
![Screenshot 9](images/Screenshot9.png)
![Screenshot 10](images/Screenshot10.png)
![Screenshot 11](images/Screenshot11.png)
![Screenshot 12](images/Screenshot12.png)
![Screenshot 13](images/Screenshot13.png)
![Screenshot 14](images/Screenshot14.png)
![Screenshot 15](images/Screenshot15.png)
![Screenshot 16](images/Screenshot16.png)
![Screenshot 17](images/Screenshot17.png)
![Screenshot 18](images/Screenshot18.png)
![Screenshot 19](images/Screenshot19.png)
![Screenshot 20](images/Screenshot20.png)
![Screenshot 21](images/Screenshot21.png)
![Screenshot 22](images/Screenshot22.png)
![Screenshot 23](images/Screenshot23.png)
![Screenshot 24](images/Screenshot24.png)
![Screenshot 25](images/Screenshot25.png)
![Screenshot 26](images/Screenshot26.png)
![Screenshot 27](images/Screenshot27.png)
![Screenshot 28](images/Screenshot28.png)
![Screenshot 29](images/Screenshot29.png)
![Screenshot 30](images/Screenshot30.png)
![Screenshot 31](images/Screenshot31.png)
![Screenshot 32](images/Screenshot32.png)
![Screenshot 32.1](images/Screenshot32.1.png)
![Screenshot 33](images/Screenshot33.png)
![Screenshot 34](images/Screenshot34.png)
![Screenshot 35](images/Screenshot35.png)
![Screenshot 36](images/Screenshot36.png)
![Screenshot 37](images/Screenshot37.png)
![Screenshot 38](images/Screenshot38.png)
