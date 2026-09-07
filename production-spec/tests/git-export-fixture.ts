import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { ROOT } from "../src/io.js";

const execFileAsync = promisify(execFile);

export type GitExportFixture = {
  head: string;
  repository: string;
  remote: string;
  sourceRef: string;
  specificationRoot: string;
  git: (...args: string[]) => Promise<string>;
  exportBundle: (out: string) => Promise<void>;
  remove: () => Promise<void>;
};

export async function createGitExportFixture(): Promise<GitExportFixture> {
  const container = await mkdtemp(join(tmpdir(), "chip-city-production-spec-"));
  const remote = join(container, "authoritative.git");
  const repository = join(container, "repository");
  const sourceRepository = resolve(ROOT, "..");
  await execFileAsync(
    "git",
    ["clone", "--quiet", "--bare", "--no-local", sourceRepository, remote],
    { encoding: "utf8" },
  );
  const sourceHead = (await execFileAsync(
    "git",
    ["-C", sourceRepository, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  )).stdout.trim();
  const sourceRef = "refs/heads/test-reviewed";
  await execFileAsync("git", ["--git-dir", remote, "update-ref", sourceRef, sourceHead], {
    encoding: "utf8",
  });
  await execFileAsync("git", ["--git-dir", remote, "symbolic-ref", "HEAD", sourceRef], {
    encoding: "utf8",
  });
  await execFileAsync(
    "git",
    ["clone", "--quiet", "--no-local", remote, repository],
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
  const git = async (...args: string[]) =>
    (await execFileAsync("git", ["-C", repository, ...args], { encoding: "utf8" })).stdout.trim();
  return {
    head,
    repository,
    remote,
    sourceRef,
    specificationRoot,
    git,
    exportBundle: async (out: string) => {
      await execFileAsync(
        join(specificationRoot, "node_modules/.bin/tsx"),
        [
          "tests/export-test-cli.ts",
          "--out",
          out,
          "--source-sha",
          head,
          "--source-ref",
          sourceRef,
          "--repository-root",
          repository,
          "--remote-url",
          remote,
        ],
        { cwd: specificationRoot, encoding: "utf8" },
      );
    },
    remove: () => rm(container, { recursive: true, force: true }),
  };
}
