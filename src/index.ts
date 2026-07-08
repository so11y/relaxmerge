import { filter, FilterOptions } from "./helpers/strategies.js";
import { merge } from "./core/merge.js";
import type { MergeCallContext } from "./types.js";

export * from "./helpers/index.js";
export * from "./types.js";
export { road } from "./utils/road.js";
export { merge } from "./core/merge.js";
export type { MergeCallContext } from "./types.js";

/** 用一组 include/exclude 规则过滤对象，返回被保留的部分。 */
export function pick(args: FilterOptions, dumbNode: Record<string, any>) {
  return merge(
    { dumbNode: filter(args) },
    { dumbNode },
    {}
  ).dumbNode;
}

const DUMB_NODE = "dumbNode";

/**
 * 用 filter 规则合并 remote/local：内部固定 dumbNode 包装，context.scope 供 moveField 等解析相对路径。
 */
export function mergeFiltered(
  filterOpts: FilterOptions,
  remote: Record<string, any>,
  local: Record<string, any>
) {
  return merge(
    { [DUMB_NODE]: filter(filterOpts) },
    { [DUMB_NODE]: remote },
    { [DUMB_NODE]: local },
    { context: { scope: DUMB_NODE } }
  )[DUMB_NODE];
}
