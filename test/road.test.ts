import { describe, it, expect } from "vitest";
import { road } from "../src/index.js";

describe("road DSL", () => {
  it("* matches exactly one level", () => {
    expect(road("a.*").test("a.b")).toBe(true);
    expect(road("a.*").test("a.b.c")).toBe(false);
  });
  it("** matches any depth (including zero)", () => {
    expect(road("a.**").test("a.b.c")).toBe(true);
    expect(road("a.**").test("a")).toBe(true);
  });
  it("{number(min,max)} matches digits within range", () => {
    expect(road("a.{number(1,3)}").test("a.2")).toBe(true);
    expect(road("a.{number(1,3)}").test("a.9")).toBe(false);
  });
  it("{number} without bounds matches any digits", () => {
    expect(road("a.{number}").test("a.999")).toBe(true);
    expect(road("a.{number}").test("a.x")).toBe(false);
  });
  it("{a|b} alternation matches listed options", () => {
    expect(road("a.{x|y}").test("a.x")).toBe(true);
    expect(road("a.{x|y}").test("a.z")).toBe(false);
  });
  it("{exclude(...)} matches anything but the excluded segment", () => {
    expect(road("a.{exclude(skip)}").test("a.keep")).toBe(true);
    expect(road("a.{exclude(skip)}").test("a.skip")).toBe(false);
  });
  it("{customize(name)} runs a user predicate on the captured segment", () => {
    const r = road("a.{customize(even)}", {
      customize: { even: (v: string) => Number(v) % 2 === 0 },
    });
    expect(r.test("a.4")).toBe(true);
    expect(r.test("a.5")).toBe(false);
  });
  it("{exclude(...)} with a trailing segment excludes only that middle level", () => {
    expect(road("a.{exclude(x)}.c").test("a.y.c")).toBe(true);
    expect(road("a.{exclude(x)}.c").test("a.x.c")).toBe(false);
  });
  it("bare * matches across levels", () => {
    expect(road("a*").test("axyz")).toBe(true);
  });
  it("test('') returns the bare regex result", () => {
    expect(road("").test("")).toBe(true);
  });
});
