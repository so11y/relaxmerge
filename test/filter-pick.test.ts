import { describe, it, expect } from "vitest";
import { merge, pick, filter, road, Strategy } from "../src/index.js";

describe("pick (filter via include/exclude)", () => {
  it("keeps everything by default", () => {
    expect(pick({}, { a: 1, b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
  });
  it("drops excluded glob subtrees", () => {
    expect(pick({ excludes: "b.**" }, { a: 1, b: { c: 2 } })).toEqual({ a: 1 });
  });
  it("keeps only included keys", () => {
    expect(pick({ includes: "a" }, { a: 1, b: 2 })).toEqual({ a: 1 });
  });
  it("supports deep include globs", () => {
    expect(pick({ includes: "b.**" }, { a: 1, b: { c: 2, d: { e: 3 } } })).toEqual({
      b: { c: 2, d: { e: 3 } },
    });
  });
  it("supports deep nested excludes while keeping siblings", () => {
    expect(
      pick({ excludes: "b.c.**" }, { a: 1, b: { c: { d: 2 }, keep: 3 }, e: 4 })
    ).toEqual({ a: 1, b: { keep: 3 }, e: 4 });
  });
  it("excludes a specific field but keeps arrays and siblings", () => {
    expect(
      pick(
        { excludes: ["settings.password"] },
        { settings: { theme: "dark", password: "secret" }, dd: [{ a1: 1 }, { a1: 2 }] }
      )
    ).toEqual({ settings: { theme: "dark" }, dd: [{ a1: 1 }, { a1: 2 }] });
  });
  it("combines includes, excludes and a stated strategy", () => {
    expect(
      pick(
        { includes: ["settings.*"], excludes: ["settings.password"], stated: Strategy.Strict },
        { settings: { theme: "dark", language: "zh", password: "secret", notifications: true } }
      )
    ).toEqual({ settings: { theme: "dark", language: "zh", notifications: true } });
  });

  it("accepts a prebuilt Road (with a {customize()} predicate) in includes", () => {
    const evenKeys = road("{customize(even)}", { customize: { even: (v) => +v % 2 === 0 } });
    expect(pick({ includes: [evenKeys] }, { 0: "a", 1: "b", 2: "c", 3: "d" })).toEqual({
      0: "a",
      2: "c",
    });
  });

  it("accepts a prebuilt Road in excludes", () => {
    const oddKeys = road("{customize(odd)}", { customize: { odd: (v) => +v % 2 === 1 } });
    expect(pick({ excludes: [oddKeys] }, { 0: "a", 1: "b", 2: "c" })).toEqual({
      0: "a",
      2: "c",
    });
  });
});

describe("filter inside a merge", () => {
  it("applies include+exclude with a stated strategy during merge", () => {
    const out = merge(
      {
        config: filter({
          includes: ["settings.*"],
          excludes: ["settings.password"],
          stated: Strategy.Strict,
        }),
      },
      { config: { settings: { theme: "dark", language: "zh", password: "new", notifications: true } } },
      { config: { settings: { theme: "light", language: "en", password: "old", notifications: false } } }
    );
    expect(out).toEqual({
      config: { settings: { theme: "dark", language: "zh", password: "old", notifications: true } },
    });
  });

  it("gives an explicit child mergeMap spec priority over the include default", () => {
    const out = merge(
      { config: filter({ mergeMap: { theme: Strategy.Skip } as any }) },
      { config: { theme: "remote", other: "remote" } },
      { config: { theme: "local", other: "local" } }
    );
    expect(out).toEqual({ config: { theme: "local", other: "remote" } });
  });
});
