import { describe, it, expect, vi } from "vitest";
import { merge, customize, Strategy } from "../src/index.js";

describe("Strategy.Replace", () => {
  it("overwrites own with config value", () => {
    expect(merge({ a: Strategy.Replace }, { a: 1 }, { a: 2 })).toEqual({ a: 1 });
  });
  it("leaves own untouched when config value is undefined", () => {
    expect(merge({ a: Strategy.Replace }, {}, { a: 2 })).toEqual({ a: 2 });
  });
});

describe("Strategy.MergeProto", () => {
  it("deep-merges own and config objects", () => {
    expect(
      merge({ a: Strategy.MergeProto }, { a: { x: 1 } }, { a: { y: 2 } })
    ).toEqual({ a: { x: 1, y: 2 } });
  });
});

describe("Strategy.Skip", () => {
  it("does not write and reports via callback", () => {
    const cb = vi.fn();
    const out = merge({ a: Strategy.Skip }, { a: 9 }, { a: 1 }, { callback: cb });
    expect(out).toEqual({ a: 1 });
    expect(cb).toHaveBeenCalledWith("a", 9);
  });
  it("works without a callback", () => {
    expect(merge({ a: Strategy.Skip }, { a: 9 }, { a: 1 })).toEqual({ a: 1 });
  });
});

describe("Strategy.Strict", () => {
  it("only fills keys own already has", () => {
    expect(
      merge({ a: Strategy.Strict }, { a: { keep: 1, extra: 2 } }, { a: { keep: 0 } })
    ).toEqual({ a: { keep: 1 } });
  });
  it("overwrites when own value is nil", () => {
    expect(merge({ a: Strategy.Strict }, { a: { k: 5 } }, { a: { k: null } })).toEqual({
      a: { k: 5 },
    });
  });
  it("keeps own-only keys the config lacks", () => {
    expect(merge({ a: Strategy.Strict }, { a: {} }, { a: { extra: 1 } })).toEqual({
      a: { extra: 1 },
    });
  });
});

describe("Strategy.Relax", () => {
  it("overwrites existing keys but drops keys own lacks (bare enum)", () => {
    expect(
      merge({ a: Strategy.Relax }, { a: { p: 1, q: 2 } }, { a: { p: 0 } })
    ).toEqual({ a: { p: 1 } });
  });
});

describe("Strategy.Customize", () => {
  it("uses the callback result as the field value", () => {
    expect(
      merge(
        { a: customize(({ ownValue, configValue }) => (ownValue ?? 0) + (configValue ?? 0)) },
        { a: 10 },
        { a: 5 }
      )
    ).toEqual({ a: 15 });
  });
});
