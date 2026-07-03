import { get, has, isArray, isNil, isObject, isUndefined, merge as deepMerge, set } from "lodash-es";
import { MergeMap, MergeCtx, MergeOptions, Strategy } from "../types.js";
import { createMergeState, DROP, FieldConfig } from "../utils/mergeState.js";
import { Frame, join, lastKey } from "./frame.js";
import { filterOf, resolve } from "./resolve.js";
import { isSameType } from "../utils/index.js";

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

/** 引擎核心：解析本 path，然后导航下钻 / 落值 / 进子层。 */
function walk(frame: Frame) {
  const { ctx, path } = frame;
  const { config, own, options } = ctx;
  const { mode, submap, field } = resolve(frame);
  const filter = filterOf(field) ?? frame.filter; // 节点自带过滤器则覆盖，否则继承

  // 纯导航层：普通子 map / 根 map 自身不做合并，只结构化下钻它的每个 key。
  if (mode === undefined) {
    const sub = submap ?? {};
    for (const key of Object.keys(sub)) {
      walk(frame.navChild(key, (sub as any)[key], filter));
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
      customize(frame, field);
      return;
    case Strategy.Strict: {
      const od = get(own, path);
      // Strict 以 own 侧结构为准：own 是对象才继续下钻，否则按叶子落值。
      processNested(frame, Strategy.Strict, od, od, get(config, path), submap, filter);
      return;
    }
    case Strategy.Relax: {
      let od = get(own, path);
      const cd = get(config, path);
      // Relax 以 config 侧结构为准：own 缺容器则先按 config 形状建空容器。
      if (isUndefined(od) && !isUndefined(cd) && isObject(cd)) {
        od = isArray(cd) ? [] : {};
        set(own, path, od);
      }
      processNested(frame, Strategy.Relax, cd, od, cd, submap, filter);
      return;
    }
  }
}

/**
 * root 决定走哪条路：对象 → 遍历子字段；非对象 → 叶子写入。
 * @param root    决定「是否继续深入」的一侧（Strict=own，Relax=config）
 * @param ownData own 侧当前值；@param outside config 侧当前值
 */
function processNested(
  frame: Frame,
  curMode: Strategy,
  root: any,
  ownData: any,
  outside: any,
  submap: MergeMap | undefined,
  filter: FieldConfig | undefined
) {
  if (isObject(root)) {
    iterateChildren(frame, curMode, ownData, outside, submap, filter);
    return;
  }
  writeLeaf(frame, curMode, ownData, outside);
}

/**
 * 遍历本层每个子字段，定出子 spec / selected / enclosed 后递归。三条互斥的子来源：
 * - 过滤器生效：resolveChild 直接给出子 spec（DROP=丢弃），过滤器对整棵子树持续生效。
 * - 有子 map：子 spec = submap[key]；子 map 没有的 key 直接丢弃（显式配置未覆盖）。
 * - 无子 map（父为裸枚举/继承）：子 spec 为空，按继承模式下钻，且不算「被选中」。
 */
function iterateChildren(
  frame: Frame,
  curMode: Strategy,
  ownData: any,
  outside: any,
  submap: MergeMap | undefined,
  filter: FieldConfig | undefined
) {
  const base = getIterationBase(curMode, ownData, outside);
  const arr = isArray(base);

  for (const key of Object.keys(base)) {
    if (filter) {
      // 过滤器直接给出子 spec（DROP=丢弃）；子 spec 沿返回值流动，无边表搭桥。
      const spec = filter.resolveChild!(join(frame.path, key), key);
      if (spec === DROP) continue;
      walk(frame.pickedChild(key, spec, curMode, arr, filter));
    } else if (submap !== undefined) {
      const spec = (submap as any)[key];
      if (spec === undefined) continue;
      walk(frame.pickedChild(key, spec, curMode, arr, undefined));
    } else {
      walk(frame.inheritedChild(key, curMode, arr));
    }
  }
}

/** 叶子写入：4 个 guard 依次筛除「不该动」的情形，剩下的按 Strict/Relax 落值。 */
function writeLeaf(frame: Frame, curMode: Strategy, ownData: any, outside: any) {
  const { config, own } = frame.ctx;
  const { path, selected, isArrayIter } = frame;
  const ownHasPath = has(own, path);

  // (A) own 缺字段，但 Relax 且 config 有值、且本字段被显式选中 —— 强行写入。
  if (!ownHasPath && !isNil(outside) && selected && curMode === Strategy.Relax) {
    set(own, path, outside);
    return;
  }

  // (B) 常规叶子合并
  // own 缺字段且非数组迭代 —— 不动（数组迭代产生的空槽允许继续）。
  if (!ownHasPath && isArrayIter === false) return;
  // own 有、config 无 —— 不动。
  if (ownHasPath && !has(config, path)) return;
  // 两侧都有但类型不同 —— 不动。
  if (!isNil(ownData) && !isNil(outside) && !isSameType(outside, ownData)) return;

  // Strict 尊重 own 的 key（值为 nil 时可被覆盖）；Relax 直接覆盖。
  const strict = curMode === Strategy.Strict;
  const relax = curMode === Strategy.Relax;
  if ((strict && ownHasPath) || relax) set(own, path, outside);
}

/**
 * Customize 分支：执行本 path 的 custom 回调，结果写回 own。field 由 resolve 直接
 * 取回并传入，不再从注册表二次读回。对外暴露 mergeNested 一个引擎入口（想整体再合并
 * 一次直接用顶层导出的 merge）；re-entry 的 selected 沿用「该 path 是否已挂载」
 * （mountedFields.has）以贴合历史行为。
 */
function customize(frame: Frame, field: FieldConfig | undefined) {
  const { ctx, path } = frame;
  const custom = field?.custom;
  if (!custom) return;

  const rootAt = (p: string, spec: any): Frame =>
    Frame.root(ctx, p, spec, ctx.state.mountedFields.has(p));

  const value = custom({
    state: ctx.state,
    path,
    own: ctx.own,
    ownValue: get(ctx.own, path),
    config: ctx.config,
    configValue: get(ctx.config, path),
    mergeNested: (root: any, od: any, out: any, p: string) =>
      processNested(rootAt(p, undefined), Strategy.Customize, root, od, out, undefined, undefined),
  });
  set(ctx.own, path, value);
}

/**
 * @description 通过配置选择性地从老数据中提取合并到新数据中
 * @param map    合成地图
 * @param config 老数据
 * @param own    新数据
 * @param options 配置
 * @returns 合并后的新数据
 */
export function merge(
  map: MergeMap,
  config: any,
  own: any,
  options: MergeOptions = {}
) {
  const state = options.state ?? createMergeState();
  const ctx: MergeCtx = { config, own, options, state };
  // 根层：把整张 map 当作一个「导航层」结构化下钻。
  walk(Frame.root(ctx, "", map, true));
  return own;
}
