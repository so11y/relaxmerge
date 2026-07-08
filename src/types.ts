import { FieldConfig, MergeState } from "./utils/mergeState.js";
import type { MergeCtx } from "./core/ctx.js";
import type { MergeSite } from "./core/site.js";

export type { MergeCtx } from "./core/ctx.js";

/** 一次 merge 调用的用户上下文（如 mergeFiltered 写入的 scope）。 */
export interface MergeCallContext {
  /** 内部挂载前缀（mergeFiltered 固定为 dumbNode），供 moveField 等解析相对路径。 */
  scope?: string;
}

export interface CustomizeContext {
  path: string;
  own: any;
  config: any;
  configValue: any;
  ownValue: any;
  state: MergeState;
  mergeNested: (root: any, ownData: any, outsideData: any, path: string,) => void;
}

/** 每层合并现场：Customize / moveField 回调可读的完整上下文。 */
export interface MergeSiteContext extends CustomizeContext {
  ctx: MergeCtx;
  /** 进入回调时的 site 快照，不随 mergeNested 改变。 */
  site: MergeSite;
  scope?: string;
  mode?: Strategy;
  submap?: MergeMap;
  filter?: FieldConfig;
  od?: any;
  cd?: any;
  selected: boolean;
  enclosed: boolean;
}

export type NodeType = {
  mode: Strategy;
  mergeMap: MergeMap | null;
}

export interface MergeMap {
  [P: string]: Strategy | MergeMap | Array<Strategy> | NodeType;
}

export enum Strategy {
  //直接被远程json进行替换
  Replace = 1 << 1,
  //进行merge合并
  MergeProto = 1 << 2,
  //另外步骤处理
  Skip = 1 << 3,
  //按照自己本身定义的格式去执行接下来的合并，只有在直接本身上有的属性才会去从远程json上获取
  Strict = 1 << 4,
  //相对放松的,对与数据来说，上面的是严格和数组的长度都一致,这个是数组长度无所谓
  Relax = 1 << 5,
  //自定义
  Customize = 1 << 6,

}

export interface MergeOptions {
  callback?: (key: string, value: any) => void;
  state?: MergeState;
  context?: MergeCallContext;
}
