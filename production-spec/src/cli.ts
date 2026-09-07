#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSafeYaml } from "./safe-yaml.js";
import { cleanGeneratedOutput } from "./clean.js";
import { compileContent, exportBundle } from "./export.js";
import { generatePacket, packetYaml, validatePacket } from "./packet.js";
import { validateBundle } from "./validate.js";
import { writeText } from "./io.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "validate") {
    const result = await validateBundle();
    if (!result.valid) {
      for (const issue of result.issues) console.error(`${issue.path}: ${issue.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Valid ready bundle ${result.bundleDigest}; policy ${result.policyDigest}; no execution authority`);
    return;
  }
  if (command === "compile") {
    const out = option("--out");
    if (!out) throw new Error("compile requires --out <directory>");
    await compileContent(resolve(out));
    console.log(`Compiled canonical runtime content to ${out}`);
    return;
  }
  if (command === "export") {
    const out = option("--out");
    const sourceSha = option("--source-sha");
    if (!out || !sourceSha) throw new Error("export requires --out <directory> --source-sha <40-hex>");
    const result = await exportBundle(resolve(out), sourceSha);
    console.log(`Exported source-bundle-valid ready import from clean checked-out HEAD to ${out}; planner bundle ${result.plannerBundleDigest}; separate digest-bound human packet approval remains mandatory`);
    return;
  }
  if (command === "generate-packet") {
    const out = option("--out");
    const baseSha = option("--base-sha");
    if (!out || !baseSha) throw new Error("generate-packet requires --out <file> --base-sha <40-hex>");
    const packet = await generatePacket(baseSha);
    await writeText(resolve(out), packetYaml(packet));
    console.log(`Generated structurally schema-valid and source-bundle-valid Direction Packet v1 at ${out}; separate digest-bound human packet approval remains mandatory`);
    return;
  }
  if (command === "validate-packet") {
    const file = option("--file");
    if (!file) throw new Error("validate-packet requires --file <yaml-or-json>");
    const source = await readFile(resolve(file), "utf8");
    const packet = file.endsWith(".json") ? JSON.parse(source) : parseSafeYaml(source, file);
    await validatePacket(packet);
    console.log(`Structurally valid against pinned Direction Packet v1 schema: ${file}; deployed factory semantic validation and target-state verification remain mandatory`);
    return;
  }
  if (command === "clean") {
    await cleanGeneratedOutput(option("--out"));
    return;
  }
  throw new Error("Usage: validate | compile --out DIR | export --out DIR --source-sha SHA | generate-packet --out FILE --base-sha SHA | validate-packet --file FILE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
