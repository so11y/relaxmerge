import { describe, it, expect } from "vitest";
import { merge, moveField, Strategy } from "../src/index.js";

describe("moveField", () => {
  it("moves a value from another path (plain)", () => {
    expect(
      merge({ dest: moveField("srcVal") }, { srcVal: 42, dest: 0 }, { dest: 1 })
    ).toEqual({ dest: 42 });
  });

  it("moves then re-merges with a mergeMap", () => {
    expect(
      merge(
        { dest: moveField("src", { inner: Strategy.Relax }) },
        { src: { inner: 7 }, dest: {} },
        { dest: {} }
      )
    ).toEqual({ dest: { inner: 7 } });
  });

  it("moves then re-merges with a Strategy enum", () => {
    expect(
      merge(
        { dest: moveField("src", Strategy.Relax) },
        { src: { a: 1, b: 2 }, dest: 0 },
        { dest: { a: 0, b: 0 } }
      )
    ).toEqual({ dest: { a: 1, b: 2 } });
  });

  it("falls back to configValue when source path is missing", () => {
    expect(
      merge({ dest: moveField("nope") }, { dest: 5 }, { dest: 99 })
    ).toEqual({ dest: 5 });
  });

  it("returns own value when both source and configValue are nil", () => {
    expect(merge({ dest: moveField("nope") }, {}, { dest: 99 })).toEqual({ dest: 99 });
  });
});
