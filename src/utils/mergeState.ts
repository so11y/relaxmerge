import { MergeMap } from "../types.js";

export type MergeState = ReturnType<typeof createMergeState>;

/** resolveChild 用来表示「丢弃该子字段」的哨兵。返回它 = 该 key 不参与合并。 */
export const DROP: unique symbol = Symbol("DROP");

/** onMounted 节点挂载时收到的上下文。 */
export type MountVisit = {
  /** 节点被挂载到的 path。 */
  path: string;
  /** { [path]: mergeMap } 形态的规范化 map。 */
  normalizedMap: MergeMap | null;
};

/** 挂载到某个 path 的字段配置。 */
export type FieldConfig = {
  /** 自定义合并回调。 */
  custom?: (o: any) => any;
  /**
   * 过滤器解析器：给定子字段完整 path，直接返回它的 spec（策略枚举 / 子 map /
   * undefined=继承），或返回 DROP 丢弃。子 spec 沿返回值流动，不借全路径边表搭桥。
   */
  resolveChild?: (childPath: string, key: string) => any | typeof DROP;
  onMounted?: (v: MountVisit) => any;
};

/**
 * 建立一次合并调用期间共享的状态容器 —— 一张注册表。
 * - mountedFields:  本次合并挂载过哪些字段的运行时记录（path→FieldConfig），供
 *                   Customize 暴露给用户的 re-entry 回调判定 selected；引擎的 field
 *                   已改为沿递归返回值传递。
 *
 * 引擎的当前模式、字段配置、过滤器等信息都作为参数在递归中显式传递
 * （见 core/merge.ts 的 MergeCtx / site 快照），递归天然构成栈，运行时无 path→config 搭桥。
 */
export function createMergeState() {
  return {
    mountedFields: new Map<string, FieldConfig>(),
  };
}
