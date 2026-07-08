import { get } from "lodash-es";
import { MergeMap, Strategy } from "../types.js";
import { FieldConfig } from "../utils/mergeState.js";

/** path 拼接：根层为空串时不加前导点。 */
export const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

/** 取 path 的末段 key（供 Skip 回调使用）。 */
export const lastKey = (path: string) => path.slice(path.lastIndexOf(".") + 1);

/** 从哪条路径走下来：决定 selected / enclosed 等流控语义。 */
export type SiteKind = "root" | "nav" | "picked" | "inherited";

/** 递归前的导航状态：path + spec + 下钻语义。 */
export interface SiteNav {
  path: string;
  spec: any;
  kind: SiteKind;
  mode?: Strategy;
  isArrayIter?: boolean;
  filter?: FieldConfig;
}

/** 当前层的合并现场快照；引擎用 ctx.site 维护当前指针。 */
export interface MergeSite extends SiteNav {
  mode: Strategy | undefined;
  submap?: MergeMap;
  field?: FieldConfig;
  od?: any;
  cd?: any;
  selected: boolean;
  enclosed: boolean;
  ownValue: any;
  configValue: any;
  scope?: string;
}

export function rootSite(path: string, spec: any): SiteNav {
  return { path, spec, kind: "root" };
}

export function navSite(parent: SiteNav, key: string, spec: any, filter?: FieldConfig): SiteNav {
  return { path: join(parent.path, key), spec, kind: "nav", filter };
}

export function pickedSite(
  parent: SiteNav,
  key: string,
  spec: any,
  mode: Strategy,
  isArrayIter: boolean,
  filter?: FieldConfig
): SiteNav {
  return { path: join(parent.path, key), spec, kind: "picked", mode, isArrayIter, filter };
}

export function inheritedSite(parent: SiteNav, key: string, mode: Strategy, isArrayIter: boolean): SiteNav {
  return { path: join(parent.path, key), spec: undefined, kind: "inherited", mode, isArrayIter };
}
