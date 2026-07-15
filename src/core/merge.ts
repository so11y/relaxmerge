import { get, has, isArray, isNil, isObject, isUndefined, merge as deepMerge, set } from "lodash-es";
import { MergeMap, MergeOptions, Strategy } from "../types.js";
import { DROP } from "../utils/mergeState.js";
import { EnterNested, MergeCtx } from "./ctx.js";
import {
  inheritedSite,
  lastKey,
  join,
  MergeSite,
  navSite,
  pickedSite,
  rootSite,
  SiteNav,
} from "./site.js";

/** 决定遍历基准：Relax 下用更长的数组 b，或合并双方 key 的对象；否则用 a。 */
function getIterationBase(curMode: Strategy, a: any, b: any) {
  if (curMode === Strategy.Relax) {
    if (isArray(a) && isArray(b) && b.length > a.length) return b;
    if (isObject(a) && isObject(b)) {
      const union: Record<string, true> = {};
      Object.keys(b).concat(Object.keys(a)).forEach((k) => (union[k] = true));
      return union;
    }
  }
  return a;
}

function runNested(ctx: MergeCtx, site: MergeSite) {
  if (isObject(site.od)) {
    iterateChildren(ctx, site);
    return;
  }
  writeLeaf(ctx, site);
}

/** mergeNested 入口：新 path，完整 buildSite。 */
const enterNested: EnterNested = (ctx, nav, overrides) => {
  runNested(ctx, ctx.buildSite(nav, overrides));
};

/** 引擎核心：解析本 path，然后导航下钻 / 落值 / 进子层。 */
function walk(ctx: MergeCtx, nav: SiteNav) {
  const site = ctx.buildSite(nav);
  const { config, own, options } = ctx;
  const { path, mode, submap, filter } = site;

  if (mode === undefined) {
    const sub = submap ?? {};
    for (const key of Object.keys(sub)) {
      walk(ctx, navSite(site, key, (sub as any)[key], filter));
    }
    return;
  }

  switch (mode) {
    case Strategy.Replace: {
      const cd = get(config, path);
      if (!isUndefined(cd)) set(own, path, cd);
      return;
    }
    case Strategy.MergeProto:
      set(own, path, deepMerge(get(own, path), get(config, path)));
      return;
    case Strategy.Skip:
      options.callback?.(lastKey(path), get(config, path));
      return;
    case Strategy.Customize:
      customize(ctx, site);
      return;
    case Strategy.Strict:
      runNested(ctx, ctx.patchSite(site, {
        od: get(own, path),
        cd: get(config, path),
      }));
      return;
    case Strategy.Relax: {
      let od = get(own, path);
      const cd = get(config, path);
      if (isUndefined(od) && !isUndefined(cd) && isObject(cd)) {
        od = isArray(cd) ? [] : {};
        set(own, path, od);
      }
      runNested(ctx, ctx.patchSite(site, { od, cd }));
      return;
    }
  }
}

function iterateChildren(ctx: MergeCtx, site: MergeSite) {
  const { mode, submap, filter, od, cd, path } = site;

  const base = getIterationBase(mode!, od, cd);
  const arr = isArray(base);

  for (const key of Object.keys(base)) {
    if (filter) {
      const spec = filter.resolveChild!(join(path, key), key);
      if (spec === DROP) continue;
      walk(ctx, pickedSite(site, key, spec, mode!, arr, filter));
    } else if (submap !== undefined) {
      const spec = (submap as any)[key];
      if (spec === undefined) continue;
      walk(ctx, pickedSite(site, key, spec, mode!, arr));
    } else {
      walk(ctx, inheritedSite(site, key, mode!, arr));
    }
  }
}

function writeLeaf(ctx: MergeCtx, site: MergeSite) {
  const { mode, od, cd, path, selected, isArrayIter } = site;
  const { config, own } = ctx;
  const ownHasPath = has(own, path);

  if (!ownHasPath && !isNil(cd) && selected && mode === Strategy.Relax) {
    set(own, path, cd);
    return;
  }

  if (!ownHasPath && isArrayIter === false) return;
  if (ownHasPath && !has(config, path)) return;
  if (
    ctx.options.sameTypeOnly &&
    !isNil(od) &&
    !isNil(cd) &&
    Object.prototype.toString.call(cd) !== Object.prototype.toString.call(od)
  ) return;

  const strict = mode === Strategy.Strict;
  const relax = mode === Strategy.Relax;
  if ((strict && ownHasPath) || relax) set(own, path, cd);
}

function customize(ctx: MergeCtx, site: MergeSite) {
  const custom = site.field?.custom;
  if (!custom) return;

  const value = custom(ctx.toSiteContext(site, enterNested));
  set(ctx.own, site.path, value);
}

export function merge(
  map: MergeMap,
  config: any,
  own: any,
  options: MergeOptions = {}
) {
  const ctx = new MergeCtx(config, own, options);
  walk(ctx, rootSite("", map));
  return own;
}
