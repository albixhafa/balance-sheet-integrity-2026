# 📊 Balance Sheet Integrity

A production-ready, full-stack financial balance sheet and reconciliation application. Built for secure, scalable financial tracking, this app allows teams to import General Ledger (GL) activity, attach supporting documentation, and manage reconciliation workflows seamlessly.

## ✨ Features
* **General Ledger Import:** Easily ingest and track GL activity.
* **Reconciliation Workflow:** Multi-step approval process (Review -> Final Approval).
* **Cloud Storage Attachments:** Securely upload and link supporting documents (receipts, statements) via AWS S3 or compatible object storage (like Linode or Cloudflare R2).
* **Role-Based Authentication:** Secure login and session management powered by NextAuth.js.
* **Production-Ready Routing:** Built-in sub-folder proxy support (`/balancesheet`) configured for Next.js and Nginx.

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