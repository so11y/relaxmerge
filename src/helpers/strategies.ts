import { has, get, isNil, isNumber, isObject } from "lodash-es";
import { CustomizeContext, MergeMap, Strategy } from "../types.js";
import { Road, road } from "../utils/road.js";
import { DROP } from "../utils/mergeState.js";
import { createNode } from "./node.js";
import { merge } from "../core/merge.js";

/** Relax 节点：按 config 侧结构下钻合并，数组长度可不一致。 */
export function relax(mergeMap: MergeMap) {
  return createNode({ mode: Strategy.Relax, map: mergeMap });
}

/** Strict 节点：按 own 侧结构下钻合并，只补 own 已有的字段。 */
export function strict(mergeMap: MergeMap) {
  return createNode({ mode: Strategy.Strict, map: mergeMap });
}

export interface FilterOptions {
  includes?: string[] | string,
  excludes?: string[] | string,
  stated?: Strategy.Strict | Strategy.Relax,
  mergeMap?: MergeMap
}

/** 过滤器节点：按 include/exclude glob 逐字段裁决，命中才参与合并。 */
export function filter(userOption?: FilterOptions) {

  const includesNormalized = Array.isArray(userOption?.includes) ? userOption.includes : [userOption?.includes ?? '**']
  const excludesNormalized = Array.isArray(userOption?.excludes) ? userOption.excludes : [userOption?.excludes]

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
        defaultOption.includes = includesNormalized.map(i => road(`${path}.${i}`))
        defaultOption.excludes = userOption?.excludes ? excludesNormalized.map(i => road(`${path}.${i}`)) : []
        defaultOption.mergeMap = normalizedMap
      },
      // 直接返回子字段的 spec（用户显式子 map 优先，否则默认策略），或 DROP 丢弃。
      resolveChild(childPath) {
        if (userOption?.excludes && defaultOption.excludes.some(pathReg => pathReg.test(childPath))) {
          return DROP
        }
        if (has(defaultOption.mergeMap, childPath)) {
          return get(defaultOption.mergeMap, childPath)
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
  custom: (context: CustomizeContext) => any
) {
  return createNode({ mode: Strategy.Customize, field: { custom } });
}

/** 迁移字段：把 config 上 beforePath 处的值搬到本 path（可选再按 anyUse 合并）。 */
export function moveField(beforePath: string, anyUse?: MergeMap)
export function moveField(beforePath: string, anyUse?: Omit<Strategy, "Skip" | "Customize"> | boolean)
export function moveField(beforePath: string, anyUse: any = false) {
  return createNode({
    mode: Strategy.Customize,
    field: {
      custom: (data) => {
        const { config, ownValue, configValue } = data
        const source = get(config, beforePath) ?? configValue;

        if (isNil(source)) return ownValue;

        if (isNumber(anyUse) || isObject(anyUse)) {
          return merge(
            { dummyHead: anyUse } as MergeMap,
            { dummyHead: source },
            { dummyHead: ownValue }
          ).dummyHead
        }
        return source
      }
    }
  });
}
