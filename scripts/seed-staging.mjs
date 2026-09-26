// Creates one test account per role in a STAGING database, for QA only.
// Refuses to run against anything whose database name lacks "staging".
// Usage: STAGING_PASSWORD=... node scripts/seed-staging.mjs
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL || "";
if (!/\/[^/]*staging[^/]*$/.test(url.split("?")[0])) {
  console.error("Refusing: DATABASE_URL does not point at a staging database.");
  process.exit(1);
}
const pw = process.env.STAGING_PASSWORD;
if (!pw || pw.length < 10) { console.error("Set STAGING_PASSWORD (10+ chars)."); process.exit(1); }

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const hash = await bcrypt.hash(pw, 10);

const accounts = [
  ["qa.admin", "QA Admin", "ADMIN", []],
  ["qa.admin2", "QA Admin Two", "ADMIN", []],
  ["qa.assembler", "QA Assembler", "ASSEMBLER", ["ABC001"]],
  ["qa.reviewer", "QA Reviewer", "REVIEWER", ["ABC001"]],
  ["qa.approver", "QA Approver", "APPROVER", ["ABC001"]],
  ["qa.outsider", "QA Outsider", "ASSEMBLER", ["XYZ123"]],
  ["qa.readonly", "QA Read Only", "ASSEMBLER", ["ABC001"], { isReadOnly: true }],
  ["qa.inactive", "QA Inactive", "ASSEMBLER", ["ABC001"], { status: "INACTIVE" }],
  ["qa.newbie", "QA Newbie", "ASSEMBLER", ["ABC001"], { requiresPasswordChange: true }],
];

for (const [local, name, role, ents, extra = {}] of accounts) {
  const email = `${local}@staging.test`;
  const data = {
    name, role, passwordHash: hash, requiresPasswordChange: false, status: "ACTIVE",
    isReadOnly: false, isLockedOut: false, failedLoginAttempts: 0, ...extra,
    entities: { set: ents.map((code) => ({ code })) },
  };
  await prisma.user.upsert({
    where: { email },
    create: { email, ...data, entities: { connect: ents.map((code) => ({ code })) } },
    update: data,
  });
  console.log("ready:", email, role, ents.join(",") || "all", JSON.stringify(extra));
}
await prisma.$disconnect();
