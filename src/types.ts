import { MergeState } from "./utils/mergeState.js";

export interface CustomizeContext {
  path: string;
  own: any;
  config: any;
  configValue: any;
  ownValue: any;
  state: MergeState;
  mergeNested: (root: any, ownData: any, outsideData: any, path: string,) => void;
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
}

/**
 * 一次合并调用期间的共享上下文：config/own 是两侧数据的根，options/state 全程不变。
 * 所有随位置变化的信息都装进 Frame 沿递归显式传递，运行时不再有 path→config 边表
 * 搭桥（field 沿 mount 返回值 / resolve 结果流动，子 spec 沿 resolveChild
 * 返回值流动）。唯一的共享可变状态是输出 own 本身。
 */
export interface MergeCtx {
  config: any;
  own: any;
  options: MergeOptions;
  state: MergeState;
}
