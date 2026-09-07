import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { cleanGeneratedOutput } from "../src/clean.js";
import { ROOT } from "../src/io.js";

const WORK = join(ROOT, "generated/clean-tests");

afterEach(async () => {
  await rm(WORK, { recursive: true, force: true });
});

describe("generated output cleanup", () => {
  test("removes only a relative descendant of the dedicated generated root", async () => {
    const target = join(WORK, "safe");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "artifact.txt"), "generated");
    await cleanGeneratedOutput("generated/clean-tests/safe");
    await expect(readFile(join(target, "artifact.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test.each([
    [resolve(ROOT, "generated/clean-tests"), "relative"],
    ["../outside", "must not contain"],
    ["generated/clean-tests/../other", "must not contain"],
    [".", "generated/ root"],
    ["..", "must not contain"],
    ["generated-other", "generated/ root"],
  ])("rejects unsafe clean path %s", async (requested, message) => {
    await expect(cleanGeneratedOutput(requested)).rejects.toThrow(message);
  });

  test("rejects symlinks anywhere in the deletion path", async () => {
    const real = join(WORK, "real");
    const linked = join(WORK, "linked");
    await mkdir(real, { recursive: true });
    await writeFile(join(real, "keep.txt"), "keep");
    await symlink(real, linked, "dir");
    await expect(
      cleanGeneratedOutput("generated/clean-tests/linked/keep.txt"),
    ).rejects.toThrow("refuses symlink paths");
    expect(await readFile(join(real, "keep.txt"), "utf8")).toBe("keep");
  });
});
