/** 判断两个值是否同类型（供 writeLeaf 的类型不一致跳过用）。调用处已保证两侧非空。 */
export const isSameType = (a: any, b: any) =>
  Object.prototype.toString.call(a) === Object.prototype.toString.call(b);
