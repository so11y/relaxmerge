import { describe, it, expect } from "vitest";
import { merge, relax, strict, Strategy } from "../src/index.js";

describe("relax / strict nesting", () => {
  it("relax node materializes own container and walks configured branch", () => {
    expect(
      merge(
        { root: relax({ deep: Strategy.Relax }) },
        { root: { deep: { x: 1 }, ignored: 2 } },
        { root: {} }
      )
    ).toEqual({ root: { deep: {} } });
  });
  it("strict node drills into own-side structure", () => {
    expect(
      merge(
        { root: strict({ deep: Strategy.Strict }) },
        { root: { deep: { x: 1 } } },
        { root: { deep: { x: 0 } } }
      )
    ).toEqual({ root: { deep: { x: 0 } } });
  });
});

describe("array handling", () => {
  it("relax grows own array to match longer config array", () => {
    expect(merge({ a: Strategy.Relax }, { a: [1, 2, 3] }, { a: [9] })).toEqual({
      a: [1, 2, 3],
    });
  });
  it("relax grows an array of objects, materializing empty slots", () => {
    expect(
      merge(
        { list: Strategy.Relax },
        { list: [{ v: 1 }, { v: 2 }, { v: 3 }] },
        { list: [{ v: 9 }] }
      )
    ).toEqual({ list: [{ v: 1 }, {}, {}] });
  });
  it("strict ignores extra config array items (own shorter)", () => {
    expect(merge({ a: Strategy.Strict }, { a: [1, 2, 3] }, { a: [9] })).toEqual({
      a: [1],
    });
  });
  it("relax keeps own's tail when the config array is shorter", () => {
    expect(merge({ a: Strategy.Relax }, { a: [9] }, { a: [1, 2, 3] })).toEqual({
      a: [9, 2, 3],
    });
  });
  it("relax overwrites array items regardless of their existing types", () => {
    expect(merge({ a: Strategy.Relax }, { a: [333, 2] }, { a: ["search"] })).toEqual({
      a: [333, 2],
    });
  });
});

describe("replacement and nil values", () => {
  it("overwrites when own and config leaf types differ", () => {
    expect(merge({ a: Strategy.Strict }, { a: { k: "str" } }, { a: { k: 1 } })).toEqual({
      a: { k: "str" },
    });
  });
  it("relax overwrites a null own value", () => {
    expect(merge({ a: Strategy.Relax }, { a: 7 }, { a: null })).toEqual({ a: 7 });
  });
  it("strict keeps own when config leaf is undefined", () => {
    expect(
      merge({ a: Strategy.Strict }, { a: { k: 1 } }, { a: { k: undefined } })
    ).toEqual({ a: { k: 1 } });
  });
  it("overwrites a scalar leaf with a config object", () => {
    expect(
      merge({ a: Strategy.Strict }, { a: { k: {} } }, { a: { k: 5 } })
    ).toEqual({ a: { k: {} } });
  });
  it.each([Strategy.Strict, Strategy.Relax])(
    "preserves the own value for strategy %s when sameTypeOnly is enabled",
    (strategy) => {
      expect(
        merge(
          { a: strategy },
          { a: { k: "remote" } },
          { a: { k: 1 } },
          { sameTypeOnly: true }
        )
      ).toEqual({ a: { k: 1 } });
    }
  );
  it("reproduces the 1.x array behavior when sameTypeOnly is enabled", () => {
    expect(
      merge(
        { a: Strategy.Relax },
        { a: [333, 2] },
        { a: ["search"] },
        { sameTypeOnly: true }
      )
    ).toEqual({ a: ["search", 2] });
  });
});

describe("own missing fields", () => {
  it("relax materializes an empty container but does not add config-only keys (bare enum)", () => {
    expect(merge({ a: Strategy.Relax }, { a: { born: 1 } }, {})).toEqual({
      a: {},
    });
  });
  it("relax overwrites present keys but drops keys own lacks (bare enum)", () => {
    expect(
      merge({ a: Strategy.Relax }, { a: { present: 1, missing: 2 } }, { a: { present: 0 } })
    ).toEqual({ a: { present: 1 } });
  });
  it("strict does not create a top-level scalar own is missing", () => {
    expect(merge({ a: Strategy.Strict }, { a: 5 }, {})).toEqual({});
  });
  it("relax creates a top-level scalar own is missing", () => {
    expect(merge({ a: Strategy.Relax }, { a: 5 }, {})).toEqual({ a: 5 });
  });
});

describe("multi-level nesting", () => {
  it("bare strict drills three levels deep", () => {
    expect(
      merge(
        { root: Strategy.Strict },
        { root: { a: { b: { c: 1 } } } },
        { root: { a: { b: { c: 0 } } } }
      )
    ).toEqual({ root: { a: { b: { c: 1 } } } });
  });
  it("bare relax drills three levels deep, dropping keys own lacks", () => {
    expect(
      merge(
        { root: Strategy.Relax },
        { root: { a: { b: { c: 1, x: 2 } } } },
        { root: { a: { b: { c: 0 } } } }
      )
    ).toEqual({ root: { a: { b: { c: 1 } } } });
  });
  it("relax node with a nested submap drills the configured branch", () => {
    expect(
      merge(
        { root: relax({ a: { b: Strategy.Relax } }) },
        { root: { a: { b: { deep: 1 }, other: 9 }, top: 8 } },
        { root: {} }
      )
    ).toEqual({ root: { a: { b: {} } } });
  });
  it("applies different strategies per key inside one relax node", () => {
    expect(
      merge(
        { r: relax({ keep: Strategy.Relax, drop: Strategy.Skip }) },
        { r: { keep: { v: 1 }, drop: { v: 2 } } },
        { r: {} }
      )
    ).toEqual({ r: { keep: {} } });
  });
});

describe("a node nested inside a plain map", () => {
  it("mounts and takes effect under a plain-map parent", () => {
    expect(
      merge(
        { outer: { inner: relax({ leaf: Strategy.Relax }) } },
        { outer: { inner: { leaf: { x: 1 }, extra: 2 } } },
        { outer: { inner: {} } }
      )
    ).toEqual({ outer: { inner: { leaf: {} } } });
  });
  it("mounts under a strict-registered parent path", () => {
    expect(
      merge(
        { outer: strict({ inner: relax({ leaf: Strategy.Relax }) }) },
        { outer: { inner: { leaf: { x: 1 }, extra: 2 } } },
        { outer: { inner: { leaf: {} } } }
      )
    ).toEqual({ outer: { inner: { leaf: {} } } });
  });
});
