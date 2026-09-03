import { isAlias, isMap, isScalar, isSeq, parseAllDocuments } from "yaml";

export class SpecError extends Error {
  constructor(message: string, readonly code = "SPEC_ERROR") {
    super(message);
  }
}

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/;

function inspectNode(node: any, path: string): void {
  if (!node) return;
  if (node.anchor) throw new SpecError(`${path}: anchors are forbidden`, "YAML_ANCHOR");
  if (isAlias(node)) throw new SpecError(`${path}: aliases are forbidden`, "YAML_ALIAS");
  if (node.tag && !String(node.tag).startsWith("tag:yaml.org,2002:")) {
    throw new SpecError(`${path}: custom tags are forbidden`, "YAML_CUSTOM_TAG");
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
        throw new SpecError(`${path}: mapping keys must be strings`, "YAML_NON_STRING_KEY");
      }
      if (pair.key.value === "<<") throw new SpecError(`${path}: merge keys are forbidden`, "YAML_MERGE_KEY");
      inspectNode(pair.value, `${path}/${pair.key.value}`);
    }
    return;
  }
  if (isSeq(node)) {
    node.items.forEach((item: unknown, index: number) => inspectNode(item, `${path}/${index}`));
    return;
  }
  if (!isScalar(node)) return;
  const source = typeof node.source === "string" ? node.source : "";
  const plain = node.type === "PLAIN";
  if (plain && typeof node.value === "string" && TIMESTAMP.test(source)) {
    throw new SpecError(`${path}: implicit timestamps must be quoted`, "YAML_IMPLICIT_TIMESTAMP");
  }
  if (typeof node.value === "number") {
    if (!Number.isFinite(node.value)) throw new SpecError(`${path}: non-finite numbers are forbidden`, "YAML_NON_FINITE");
    if (Number.isInteger(node.value) && !Number.isSafeInteger(node.value)) {
      throw new SpecError(`${path}: unsafe integers are forbidden`, "YAML_UNSAFE_INTEGER");
    }
    if (!JSON_NUMBER.test(source)) throw new SpecError(`${path}: ${source} is not a JSON number`, "YAML_NON_JSON_NUMBER");
  }
}

function inspectJson(value: unknown, path = "$"): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new SpecError(`${path}: unpaired surrogate`, "YAML_UNPAIRED_SURROGATE");
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new SpecError(`${path}: unpaired surrogate`, "YAML_UNPAIRED_SURROGATE");
      }
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SpecError(`${path}: non-finite number`, "YAML_NON_FINITE");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new SpecError(`${path}: unsafe integer`, "YAML_UNSAFE_INTEGER");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectJson(item, `${path}/${index}`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) inspectJson(item, `${path}/${key}`);
    return;
  }
  throw new SpecError(`${path}: value is not representable in JSON`, "YAML_NON_JSON_VALUE");
}

export function parseSafeYaml(source: string, file = "<yaml>"): unknown {
  const documents = parseAllDocuments(source, {
    schema: "core",
    merge: false,
    uniqueKeys: true,
    prettyErrors: false,
  });
  if (documents.length !== 1) throw new SpecError(`${file}: exactly one YAML document is required`, "YAML_DOCUMENT_COUNT");
  const document = documents[0]!;
  if (document.errors.length) throw new SpecError(`${file}: ${document.errors.map((error) => error.message).join("; ")}`, "YAML_PARSE");
  inspectNode(document.contents, "$");
  const value = document.toJS({ mapAsMap: false, maxAliasCount: 0 });
  inspectJson(value);
  return value;
}
