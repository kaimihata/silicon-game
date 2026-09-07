import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { ROOT } from "../src/io.js";

const execFileAsync = promisify(execFile);

export type GitExportFixture = {
  head: string;
  exportBundle: (out: string) => Promise<void>;
  remove: () => Promise<void>;
};

export async function createGitExportFixture(): Promise<GitExportFixture> {
  const container = await mkdtemp(join(tmpdir(), "chip-city-production-spec-"));
  const repository = join(container, "repository");
  const sourceRepository = resolve(ROOT, "..");
  await execFileAsync(
    "git",
    ["clone", "--quiet", "--no-hardlinks", sourceRepository, repository],
    { encoding: "utf8" },
  );
  await execFileAsync(
    "git",
    ["-C", repository, "remote", "set-url", "origin", "https://github.com/kaimihata/silicon-game.git"],
    { encoding: "utf8" },
  );
  const specificationRoot = join(repository, "production-spec");
  const sourceModules = join(ROOT, "node_modules");
  const fixtureModules = join(specificationRoot, "node_modules");
  await mkdir(fixtureModules);
  for (const entry of await readdir(sourceModules)) {
    const source = join(sourceModules, entry);
    const type = (await lstat(source)).isDirectory() ? "dir" : "file";
    await symlink(source, join(fixtureModules, entry), type);
  }
  const head = (await execFileAsync(
    "git",
    ["-C", repository, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  )).stdout.trim();
  return {
    head,
    exportBundle: async (out: string) => {
      await execFileAsync(
        join(specificationRoot, "node_modules/.bin/tsx"),
        ["src/cli.ts", "export", "--out", out, "--source-sha", head],
        { cwd: specificationRoot, encoding: "utf8" },
      );
    },
    remove: () => rm(container, { recursive: true, force: true }),
  };
}
