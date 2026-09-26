import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

/* Attachment storage on a private volume.
 *
 * Files live outside public/, so Next.js never serves them directly; the only
 * way to read one is through the download route, which checks the caller can
 * see an account the file is attached to. Keys are random, so a name can
 * neither be guessed nor collide. Swapping in S3-compatible storage later
 * means reimplementing these three functions and nothing else.
 */

const ROOT = process.env.STORAGE_DIR || path.join(process.cwd(), "storage", "attachments");
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Extension -> served content type. Anything else is refused at upload.
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

// Only these are shown in the browser; everything else downloads.
export const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

const fullPath = (key: string) => {
  if (!/^[a-f0-9]{2}\/[a-f0-9]{48}$/.test(key)) throw new Error("bad storage key");
  return path.join(ROOT, key);
};

export async function saveFile(buf: Buffer) {
  const id = crypto.randomBytes(24).toString("hex");
  const key = `${id.slice(0, 2)}/${id}`;
  const p = fullPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, buf, { flag: "wx" });
  return { key, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}

export async function readFile(key: string) {
  return fs.readFile(fullPath(key));
}
