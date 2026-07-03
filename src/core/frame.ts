import { MergeCtx, Strategy } from "../types.js";
import { FieldConfig } from "../utils/mergeState.js";

/** path 拼接：根层为空串时不加前导点。 */
export const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

/** 取 path 的末段 key（供 Skip 回调使用）。 */
export const lastKey = (path: string) => path.slice(path.lastIndexOf(".") + 1);

/**
 * 递归中一个位置的全部上下文。不可变；下钻一层用工厂方法派生。
 *
 * 「子层参数如何从父层推导」这套规则**只住在四个工厂一处**，是理解整个引擎数据
 * 流向的唯一入口：想知道 selected/enclosed/filter/mode 怎么流下去，看它们即可。
 */
export class Frame {
  private constructor(
    readonly ctx: MergeCtx,
    /** 完整路径。data 读写用 get/set(root, path)；过滤器按完整 path 匹配 glob。 */
    readonly path: string,
    /** 本 path 上的 mergeMap 配置：枚举 / 子 map / 节点 / undefined=继承。 */
    readonly spec: any,
    /** spec 自身不带模式时沿用的父层模式。 */
    readonly inheritedMode: Strategy | undefined,
    /** 是否被「显式选中」（子 map 项 / 过滤器准入 / 根入口）。仅影响 Relax 物化缺失叶子。 */
    readonly selected: boolean,
    /** 父层是否在按数组下标迭代。顶层为 undefined（不能是 false，见 writeLeaf B）。 */
    readonly isArrayIter: boolean | undefined,
    /** 祖先过滤器；命中即对整棵子树持续生效。 */
    readonly filter: FieldConfig | undefined,
    /** 是否处于显式子 map 管辖下（影响裸枚举子字段是否自动下钻）。 */
    readonly enclosed: boolean
  ) {}

  /** 根/入口帧：无继承模式、非数组迭代、无过滤器、不受子 map 管辖。 */
  static root(ctx: MergeCtx, path: string, spec: any, selected: boolean): Frame {
    return new Frame(ctx, path, spec, undefined, selected, undefined, undefined, false);
  }

  /** 导航层子项（父为普通子 map / 根 map）：选中、继承过滤器、自由下钻。 */
  navChild(key: string, spec: any, filter: FieldConfig | undefined): Frame {
    return new Frame(this.ctx, join(this.path, key), spec, undefined, true, undefined, filter, false);
  }

  /** 显式选中的子项（过滤器准入 / 子 map 命中）：选中、受子 map 管辖。 */
  pickedChild(key: string, spec: any, mode: Strategy, isArrayIter: boolean, filter: FieldConfig | undefined): Frame {
    return new Frame(this.ctx, join(this.path, key), spec, mode, true, isArrayIter, filter, true);
  }

  /** 继承下钻的子项（父为裸枚举/继承，无显式配置）：不选中、自由下钻。 */
  inheritedChild(key: string, mode: Strategy, isArrayIter: boolean): Frame {
    return new Frame(this.ctx, join(this.path, key), undefined, mode, false, isArrayIter, undefined, false);
  }
}
