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

## 📸 Screenshots

*Demo data; every name and figure is fictional.*

**Balance sheet**: every GL account for an entity with its period, status, open items and balance.
![Balance sheet dashboard](images/02-dashboard.png)

**Account reconciliation**: the three-step sign-off, the period's lines and their supporting documents.
![Account reconciliation](images/03-account.png)

**Clearing lines**: select lines to see their net, then clear them or attach support from the floating bar.
![Selecting lines](images/04-selection-bar.png)

**Sign-off**: each step asks for an explicit confirmation.
![Sign-off confirmation](images/05-sign-off.png)

**Close status**: where every account stands across all entities.
![Close status](images/06-close-status.png)

**Import**: preview a CSV before it is validated; nothing is saved unless every row passes.
![Import activity](images/07-import.png)

**Administration**: users, roles and entity access, plus the ledger structure and audit log.
![Users](images/08-admin-users.png)
![Entities and GL accounts](images/09-admin-entities.png)

**Profile and sign-in**
![Profile](images/10-profile.png)
![Sign in](images/01-sign-in.png)

**On a phone**

<p>
  <img src="images/11-mobile-dashboard.png" alt="Dashboard on a phone" width="300">
  <img src="images/12-mobile-account.png" alt="Account on a phone" width="300">
</p>
