import { isNumber, isObject } from "lodash-es";
import { MergeMap, Strategy } from "../types.js";
import { FieldConfig } from "../utils/mergeState.js";
import { MergeNode } from "../helpers/node.js";
import { Frame } from "./frame.js";

/** field 是否是一个「过滤器」（能逐字段裁决子 spec）。 */
export const filterOf = (field?: FieldConfig) => (field && field.resolveChild ? field : undefined);

/**
 * 把本 path 的 spec 解析成「要做什么」：mode（undefined=纯导航层）、子 map、field。
 * - 节点：instanceof MergeNode 识别，幂等挂载并**直接取回 field**（mount 返回值）。
 *   复用节点二次挂载得 undefined field，符合 R1。
 * - 裸枚举：自身即 mode；enclosed 下视为空子 map（子字段不再自动下钻），否则无子 map。
 * - 普通子 map：不带 mode（继承 inheritedMode），自身即子 map。
 * - undefined：纯继承。
 */
export interface Resolved {
  mode: Strategy | undefined;
  submap?: MergeMap;
  field?: FieldConfig;
}

export function resolve(frame: Frame): Resolved {
  const { spec, path, inheritedMode, enclosed, ctx } = frame;
  if (spec instanceof MergeNode) {
    const field = spec.mount(ctx.state, path);
    return { mode: spec.mode, submap: (spec.mergeMap ?? undefined) as MergeMap | undefined, field };
  }
  if (isNumber(spec)) return { mode: spec as Strategy, submap: enclosed ? ({} as MergeMap) : undefined };
  if (isObject(spec)) return { mode: inheritedMode, submap: spec as MergeMap };
  return { mode: inheritedMode };
}
