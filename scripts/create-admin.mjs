// Creates the first admin on an empty database, so a fresh install can be
// signed into. Prints a one-time temporary password; the admin must replace it
// at first sign-in. Refuses to touch an account that already exists.
// Usage: ADMIN_EMAIL=you@example.com [ADMIN_NAME="Your Name"] node scripts/create-admin.mjs
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const name = (process.env.ADMIN_NAME || "Administrator").trim();
if (!url) { console.error("Set DATABASE_URL."); process.exit(1); }
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Set ADMIN_EMAIL to a valid address."); process.exit(1); }

// Same alphabet as lib/password.ts: no look-alike characters.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const password = Array.from(crypto.randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`Refusing: ${email} already exists. Reset its password from the admin panel instead.`);
    process.exit(1);
  }
  await prisma.user.create({
    data: { email, name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12), requiresPasswordChange: true },
  });
  console.log(`Created admin ${email}`);
  console.log(`Temporary password: ${password}`);
  console.log("You will be asked to choose a new password at first sign-in.");
} finally {
  await prisma.$disconnect();
}
