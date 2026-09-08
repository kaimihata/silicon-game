import { describe, expect, test } from "vitest";
import { parseSafeYaml, SpecError } from "../src/safe-yaml.js";

describe("safe YAML", () => {
  test("accepts the JSON data model", () => {
    expect(parseSafeYaml("name: chip\ncount: 3\nenabled: true\nitems: [a, b]\n")).toEqual({
      name: "chip",
      count: 3,
      enabled: true,
      items: ["a", "b"],
    });
  });

  test.each([
    ["duplicate keys", "a: 1\na: 2\n"],
    ["anchor", "a: &x 1\nb: 2\n"],
    ["alias", "a: &x 1\nb: *x\n"],
    ["merge", "a: {x: 1}\nb: {<<: {x: 2}}\n"],
    ["custom tag", "a: !thing value\n"],
    ["implicit timestamp", "at: 2026-08-29\n"],
    ["hex number", "n: 0x10\n"],
    ["leading-zero number", "n: 012\n"],
    ["non-finite", "n: .inf\n"],
    ["unsafe integer", "n: 9007199254740992\n"],
    ["multiple documents", "a: 1\n---\nb: 2\n"],
  ])("rejects %s", (_name, source) => {
    expect(() => parseSafeYaml(source)).toThrow(SpecError);
  });
});
