import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseSafeYaml } from "./safe-yaml.js";

export const ROOT = resolve(import.meta.dirname, "..");

export async function readYaml<T = any>(path: string): Promise<T> {
  return parseSafeYaml(await readFile(path, "utf8"), relative(ROOT, path)) as T;
}

export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function listFiles(directory: string, suffix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path, suffix));
    else if (!suffix || entry.name.endsWith(suffix)) result.push(path);
  }
  return result.sort();
}
