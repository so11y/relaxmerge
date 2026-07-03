import { describe, it, expect } from "vitest";
import { merge, customize, Strategy } from "../src/index.js";
import { createMergeState } from "../src/utils/mergeState.js";

describe("options.state sharing across calls", () => {
  it("reuses a mountedFields registry passed via options.state", () => {
    const state = createMergeState();
    merge({ a: customize(({ configValue }) => configValue) }, { a: 1 }, { a: 0 }, { state });
    expect(state.mountedFields.has("a")).toBe(true);

    merge({ b: customize(({ configValue }) => configValue) }, { b: 2 }, { b: 0 }, { state });
    expect(state.mountedFields.has("a")).toBe(true);
    expect(state.mountedFields.has("b")).toBe(true);
  });
});

describe("top-level scalars", () => {
  it("relax writes a top-level scalar", () => {
    expect(merge({ a: Strategy.Relax }, { a: 5 }, {})).toEqual({ a: 5 });
  });
  it("strict skips a top-level scalar own is missing", () => {
    expect(merge({ a: Strategy.Strict }, { a: 5 }, {})).toEqual({});
  });
});

describe("empty / no-op merges", () => {
  it("empty map leaves own untouched", () => {
    expect(merge({}, { a: 1 }, { b: 2 })).toEqual({ b: 2 });
  });
  it("an undefined rule for a key is a no-op, other keys still apply", () => {
    expect(
      merge({ a: undefined as any, b: Strategy.Replace }, { a: 1, b: 1 }, { a: 0, b: 0 })
    ).toEqual({ a: 0, b: 1 });
  });
});
