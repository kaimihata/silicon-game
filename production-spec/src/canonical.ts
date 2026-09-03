import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) throw new Error("Value cannot be canonicalized");
  return result;
}

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
