import { filter, FilterOptions } from "./helpers/strategies.js";
import { merge } from "./core/merge.js";

export * from "./helpers/index.js";
export * from "./types.js";
export { road } from "./utils/road.js";
export { merge } from "./core/merge.js";

/** 用一组 include/exclude 规则过滤对象，返回被保留的部分。 */
export function pick(args: FilterOptions, dumbNode: Record<string, any>) {
  return merge(
    { dumbNode: filter(args) },
    { dumbNode },
    {}
  ).dumbNode;
}
