import { basename } from "node:path";

export type ManifestArtifact = {
  path: string;
  kind: string;
  schema: string;
};

export function targetPathForArtifact(artifact: ManifestArtifact): string {
  if (artifact.kind === "registry") return `code-factory/registries/${basename(artifact.path)}`;
  if (artifact.kind === "policy") return `code-factory/policy/${basename(artifact.path)}`;
  if (artifact.kind === "catalog") return `specifications/content/${basename(artifact.path)}`;
  if (artifact.kind === "fixture") return `specifications/fixtures/${basename(artifact.path)}`;
  if (artifact.kind === "requirements") return `specifications/${artifact.path}`;
  if (artifact.kind === "packet_config") {
    return "code-factory/direction-packets/templates/chip-city-foundation-01.config.yaml";
  }
  return artifact.path;
}

export function targetSchemaPath(sourcePath: string): string {
  return `specifications/schemas/${basename(sourcePath)}`;
}
