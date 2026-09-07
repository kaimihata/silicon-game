#!/usr/bin/env node
import { resolve } from "node:path";
import { exportBundleFromRepository } from "../src/export.js";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

await exportBundleFromRepository(
  resolve(option("--out")),
  option("--source-sha"),
  option("--source-ref"),
  resolve(option("--repository-root")),
  {
    remoteName: "origin",
    remoteUrl: option("--remote-url"),
    sourceRepository: "fixture/chip-city",
  },
);
