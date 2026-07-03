import { MergeMap, NodeType, Strategy } from "../types.js";
import { FieldConfig, MergeState } from "../utils/mergeState.js";

export interface NodeSpec {
  mode: Strategy;
  map?: MergeMap | null;
  field?: FieldConfig;
}

/**
 * 放进 MergeMap 的节点描述符：一份「无状态的合并配置」（mode + 子 map + field）。
 * 引擎通过 `instanceof MergeNode` 识别它，通过 mount() 挂载并取回 field
 * （field 沿返回值传递，不经边表搭桥）。
 *
 * 描述符不带任何跨调用状态，可安全复用：同一个节点放到多个 key、或跨多次 merge
 * 使用，每处都独立生效（每条 path 各自 mount 一次；walk 深度优先，逐 path 串行）。
 */
export class MergeNode implements NodeType {
  readonly mode: Strategy;
  readonly mergeMap: MergeMap | null;
  private readonly field?: FieldConfig;

  constructor({ mode, map = null, field }: NodeSpec) {
    this.mode = mode;
    this.mergeMap = map;
    this.field = field;
  }

  /**
   * 挂载本 path 并返回 field：跑 onMounted（过滤器借此按 path 编译 glob），把 field
   * 记进 state.mountedFields（供 Customize re-entry 回调判定 selected），返回 field
   * 供 resolve 使用。无实例级状态，故可复用。
   */
  mount(state: MergeState, path: string): FieldConfig | undefined {
    this.field?.onMounted?.({
      path,
      normalizedMap: { [path]: this.mergeMap } as MergeMap,
    });
    if (this.field) state.mountedFields.set(path, this.field);
    return this.field;
  }
}

/** 构造一个节点描述符。工厂只产出干净数据；挂载逻辑归 MergeNode.mount。 */
export function createNode(spec: NodeSpec): MergeNode {
  return new MergeNode(spec);
}
