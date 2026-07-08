import { has, get, isNil, isNumber, isObject } from "lodash-es";
import { MergeMap, MergeSiteContext, Strategy } from "../types.js";
import { Road, road } from "../utils/road.js";
import { DROP } from "../utils/mergeState.js";
import { createNode } from "./node.js";
import { merge } from "../core/merge.js";
import { join } from "../core/site.js";

/** Relax 节点：按 config 侧结构下钻合并，数组长度可不一致。 */
export function relax(mergeMap: MergeMap) {
  return createNode({ mode: Strategy.Relax, map: mergeMap });
}

/** Strict 节点：按 own 侧结构下钻合并，只补 own 已有的字段。 */
export function strict(mergeMap: MergeMap) {
  return createNode({ mode: Strategy.Strict, map: mergeMap });
}

/** include/exclude 的单条规则：字符串 glob，或已编译好的 Road（可携带 customize 谓词）。 */
export type FilterRule = string | Road;

export interface FilterOptions {
  includes?: FilterRule[] | FilterRule,
  excludes?: FilterRule[] | FilterRule,
  stated?: Strategy.Strict | Strategy.Relax,
  mergeMap?: MergeMap
}

/** 过滤器节点：按 include/exclude glob 逐字段裁决，命中才参与合并。 */
export function filter(userOption?: FilterOptions) {

  const includesNormalized = Array.isArray(userOption?.includes) ? userOption.includes : [userOption?.includes ?? '**']
  const excludesNormalized = Array.isArray(userOption?.excludes) ? userOption.excludes : [userOption?.excludes]

  // 规则按挂载 path 前缀化后再编译。传入的是 Road 时取其 pattern/options 重编译，
  // 以便保留 {customize()} 等需要 options 的 token，同时仍享受相对路径前缀。
  const compileAt = (path: string) => (rule: FilterRule | undefined) =>
    rule instanceof Road ? road(join(path, rule.pattern!), rule.options) : road(join(path, rule!))

  // include/exclude 规则在挂载时才知道 currentPath，故 road 编译推迟到 onMounted。
  const defaultOption = {
    stated: Strategy.Relax,
    mergeMap: Object.assign({}, userOption?.mergeMap) as any,
    includes: [] as Array<Road>,
    excludes: [] as Array<Road>
  }
  return createNode({
    mode: defaultOption.stated,
    map: defaultOption.mergeMap,
    field: {
      onMounted({ path, normalizedMap }) {
        defaultOption.includes = includesNormalized.map(compileAt(path))
        defaultOption.excludes = userOption?.excludes ? excludesNormalized.map(compileAt(path)) : []
        defaultOption.mergeMap = normalizedMap
      },
      // mergeMap 显式配置优先于 exclude/include 默认裁决。
      resolveChild(childPath) {
        if (has(defaultOption.mergeMap, childPath)) {
          return get(defaultOption.mergeMap, childPath)
        }
        if (userOption?.excludes && defaultOption.excludes.some(pathReg => pathReg.test(childPath))) {
          return DROP
        }
        if (defaultOption.includes.some(pathReg => pathReg.test(childPath))) {
          return defaultOption.stated
        }
        return DROP
      }
    }
  });
}

/** 自定义节点：用回调完全接管本 path 的合并结果。 */
export function customize(
  custom: (context: MergeSiteContext) => any
) {
  return createNode({ mode: Strategy.Customize, field: { custom } });
}

function resolveBeforePath(site: MergeSiteContext, beforePath: string) {
  const { scope, config } = site;
  const absolute = scope ? join(scope, beforePath) : beforePath;
  return get(config, absolute);
}

/**
 * 迁移字段：把 config 上 `beforePath` 处的值搬到本 path。
 *
 * @param beforePath 源路径。有 `context.scope` 时相对 scope，否则为 config 绝对路径。
 */
export function moveField(beforePath: string, mergeRule?: MergeMap)
export function moveField(beforePath: string, mergeRule?: Omit<Strategy, "Skip" | "Customize"> | boolean)
export function moveField(beforePath: string, mergeRule: any = false) {
  return createNode({
    mode: Strategy.Customize,
    field: {
      custom: (site: MergeSiteContext) => {
        const { ownValue, configValue } = site;
        const source = resolveBeforePath(site, beforePath) ?? configValue;

        if (isNil(source)) return ownValue;

        if (isNumber(mergeRule) || isObject(mergeRule)) {
          return merge(
            { dummyHead: mergeRule } as MergeMap,
            { dummyHead: source },
            { dummyHead: ownValue }
          ).dummyHead
        }
        return source
      }
    }
  });
}
