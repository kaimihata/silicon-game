import { lstat, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ROOT } from "./io.js";

export const GENERATED_OUTPUT_ROOT = resolve(ROOT, "generated");

export async function cleanGeneratedOutput(requested = "generated"): Promise<void> {
  if (isAbsolute(requested)) throw new Error("clean --out must be relative to production-spec/");
  if (requested.split(/[\\/]/).includes("..")) throw new Error("clean --out must not contain '..'");
  const target = resolve(ROOT, requested);
  const targetRelative = relative(GENERATED_OUTPUT_ROOT, target);
  if (targetRelative === ".." || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) {
    throw new Error("clean --out must be the generated/ root or one of its descendants");
  }
  const rootRelative = relative(ROOT, target);
  if (!rootRelative || rootRelative === "." || rootRelative === ".." || rootRelative.startsWith(`..${sep}`)) {
    throw new Error("clean refuses the production-spec or repository root");
  }
  const segments = targetRelative ? targetRelative.split(sep) : [];
  let current = GENERATED_OUTPUT_ROOT;
  for (const segment of ["", ...segments]) {
    if (segment) current = resolve(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`clean refuses symlink paths: ${relative(ROOT, current)}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      break;
    }
  }
  await rm(target, { recursive: true, force: true });
}
