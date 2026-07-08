import { get } from "lodash-es";
import { MergeOptions, MergeSiteContext, Strategy } from "../types.js";
import { createMergeState, MergeState } from "../utils/mergeState.js";
import { filterOf, resolve } from "./resolve.js";
import { MergeSite, rootSite, SiteNav } from "./site.js";

type SiteOverrides = Partial<Pick<MergeSite, "mode" | "submap" | "field" | "filter" | "od" | "cd">>;
type SitePatch = Partial<Pick<MergeSite, "od" | "cd">>;

/** 从全新 nav 进入嵌套层（mergeNested 专用，会 buildSite）。 */
export type EnterNested = (ctx: MergeCtx, nav: SiteNav, overrides?: SiteOverrides) => void;

/** 一次 merge 调用的共享上下文：数据根、状态、以及当前层 site 指针。 */
export class MergeCtx {
  readonly state: MergeState;

  /**
   * 当前执行指针，随 walk / mergeNested 更新。
   * 回调边界请先捕获 site 快照，不要依赖回调结束后的 ctx.site。
   */
  site!: MergeSite;

  constructor(
    readonly config: any,
    readonly own: any,
    readonly options: MergeOptions = {}
  ) {
    this.state = options.state ?? createMergeState();
  }

  /** 根据导航状态构建并挂载当前层 site（会 resolve / mount）。 */
  buildSite(nav: SiteNav, overrides?: SiteOverrides): MergeSite {
    const resolved = resolve(this, nav);
    const filter = overrides?.filter ?? filterOf(resolved.field) ?? nav.filter;

    const site: MergeSite = {
      ...nav,
      mode: overrides?.mode ?? resolved.mode,
      submap: overrides?.submap ?? resolved.submap,
      field: overrides?.field ?? resolved.field,
      filter,
      od: overrides?.od,
      cd: overrides?.cd,
      selected: nav.kind !== "inherited",
      enclosed: nav.kind === "picked",
      ownValue: get(this.own, nav.path),
      configValue: get(this.config, nav.path),
      scope: this.options.context?.scope,
    };
    this.site = site;
    return site;
  }

  /** 在已有 site 快照上补丁 od/cd，不重新 resolve（避免重复 mount）。 */
  patchSite(site: MergeSite, patch: SitePatch): MergeSite {
    const next: MergeSite = { ...site, ...patch };
    this.site = next;
    return next;
  }

  /** 把 site 快照转成 customize / moveField 回调上下文。 */
  toSiteContext(site: MergeSite, enterNested: EnterNested): MergeSiteContext {
    return {
      ctx: this,
      site,
      path: site.path,
      own: this.own,
      config: this.config,
      ownValue: site.ownValue,
      configValue: site.configValue,
      state: this.state,
      scope: site.scope,
      mode: site.mode,
      submap: site.submap,
      filter: site.filter,
      od: site.od,
      cd: site.cd,
      selected: site.selected,
      enclosed: site.enclosed,
      mergeNested: (_root, ownData, outsideData, nestedPath) => {
        enterNested(this, rootSite(nestedPath, undefined), {
          od: ownData,
          cd: outsideData,
          mode: Strategy.Customize,
        });
      },
    };
  }
}
