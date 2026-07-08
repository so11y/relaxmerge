import { describe, it, expect } from "vitest";
import { merge, customize, Strategy } from "../src/index.js";

describe("customize", () => {
  it("rewrites a value via the callback", () => {
    expect(
      merge(
        { a: customize(({ ownValue, configValue }) => (ownValue ?? 0) + (configValue ?? 0)) },
        { a: 10 },
        { a: 5 }
      )
    ).toEqual({ a: 15 });
  });

  it("receives full context (path, own, config)", () => {
    const seen: any = {};
    merge(
      {
        a: customize((ctx) => {
          seen.path = ctx.path;
          seen.ownValue = ctx.ownValue;
          seen.configValue = ctx.configValue;
          return ctx.configValue;
        }),
      },
      { a: 1 },
      { a: 2 }
    );
    expect(seen).toEqual({ path: "a", ownValue: 2, configValue: 1 });
  });

  it("drives a nested merge through mergeNested", () => {
    const out = merge(
      {
        out: customize(({ mergeNested, own, configValue }) => {
          const target: any = {};
          own.__scratch = target;
          mergeNested(configValue, target, configValue, "__scratch");
          const r = own.__scratch;
          delete own.__scratch;
          return r;
        }),
      },
      { out: { a: 1, b: 2 } },
      { out: {} }
    );
    expect(out).toEqual({ out: {} });
  });

  it("keeps site snapshot while ctx.site pointer moves during mergeNested", () => {
    const seen: any = {};
    merge(
      {
        out: customize((c) => {
          seen.snapshotPath = c.site.path;
          seen.flatPath = c.path;
          c.mergeNested({ a: 1 }, {}, { a: 1 }, "__nested");
          seen.afterSnapshotPath = c.site.path;
          seen.afterPointerPath = c.ctx.site.path;
          return c.ownValue;
        }),
      },
      { out: { x: 1 } },
      { out: { x: 2 } }
    );
    expect(seen).toEqual({
      snapshotPath: "out",
      flatPath: "out",
      afterSnapshotPath: "out",
      afterPointerPath: "__nested",
    });
  });

  it("reuses the same descriptor under two keys (mounts independently)", () => {
    const node = customize(
      ({ ownValue, configValue }) => (ownValue ?? 0) + (configValue ?? 0) + 100
    );
    expect(merge({ a: node, b: node }, { a: 1, b: 2 }, { a: 10, b: 20 })).toEqual({
      a: 111,
      b: 122,
    });
  });

  it("reuses the same descriptor across independent merges", () => {
    const node = customize(
      ({ ownValue, configValue }) => (ownValue ?? 0) + (configValue ?? 0)
    );
    const first = merge({ a: node }, { a: 1 }, { a: 10 });
    const second = merge({ a: node }, { a: 2 }, { a: 20 });
    expect({ first, second }).toEqual({ first: { a: 11 }, second: { a: 22 } });
  });
});
