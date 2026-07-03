export class Road {
  range = {};
  customize = {};
  pattern?: string;
  regex: RegExp | null = null;
  options: {
    customize?: Record<string, (v: string) => Boolean>
  }

  constructor(pattern: string, options: Road["options"] = {}) {
    this.options = options;
    this.builder(pattern);
  }

  test(value: string) {
    const result = this.regex!.test(value);
    if (value) {
      const match = value.match(this.regex!);
      return result && this.matchPipe(match!).every((match) => match());
    }
    return result;
  }

  matchPipe(match?: RegExpMatchArray) {
    return [
      () => this.matchRange(match),
      () => this.matchCustomer(match)
    ];
  }

  builder(pattern: string) {
    this.pattern = pattern;
    const escaped = pattern
      .replace(/([*.+^=!:${}()|[\]\/\\])/g, "\\$1")
      //转换.**（任意层，每层为 1+ 非点字符，含数组下标等单字符段）
      .replace(/\\\.\\\*\\\*/g, "(\\.[^.]+)*")
      //转换.*（恰好一层，可为单字符）
      .replace(/\\\.\\\*/g, "(\\.[^.]+)?")
      //转换*
      .replace(/\\\*/g, ".*")
      .replace(/\\\{customize\\\(([^}]+)\\\)\\\}/g, (match, p1) => {
        const key = `customize_${p1}`;
        if (this.options?.customize?.[p1]) {
          this.customize[key] = this.options.customize[p1];
        }
        return `(?<${key}>.*)`;
      })
      //转换{number}
      .replace(
        /\\\{number(?:\\\((\d+)(?:,(\d+))?\\\))?\\\}/g,
        (match, min, max, index) => {
          const key = `range_${index}`;
          this.range[key] = {
            key,
            min: min ?? null,
            max: max ?? null
          };
          return `(?<${key}>\\d+)`;
        }
      )
      .replace(/\\\{exclude\\\(([^}]+)\\\)\\\}(.*)/g, (match, p1, p2) => {
        const exclusions = p1
          .split("\\|")
          .map(
            (v) =>
              `${v.replace(/\\([[\]])/g, "$1")}${p2 ? `(?:\\.|$)` : "$"}`
          )
          .join("|");
        return `(?!${exclusions})${p2 ? `(([^.]+)${p2})` : ".+"}`;
      })
      //转换{11|22}
      .replace(
        /\\\{([^}]*\|[^}]+)\\\}/g,
        (match, p1) => `(${p1.split("\\|").join("|")})`
      );

    this.regex = new RegExp("^" + escaped + "$");

    return this;
  }

  matchRange(match?: RegExpMatchArray) {
    if (match && match.groups) {
      return Object.keys(match.groups)
        .map((v) => this.range[v])
        .filter(Boolean)
        .every((v) => {
          const value = match.groups![v.key];
          const testMin = v.min === null ? true : value >= v.min;
          const testMax = v.max === null ? true : value <= v.max;
          return testMin && testMax;
        });
    }
    return true;
  }

  matchCustomer(match?: RegExpMatchArray) {
    if (match && match.groups) {
      return Object.keys(match.groups)
        .map((v) => ({
          key: v,
          fn: this.customize[v]
        }))
        .filter((v) => !!v.fn)
        .every((v) => v.fn(match.groups![v.key]));
    }
    return true;
  }
}

export function road(pattern: string, options: Road["options"] = {}) {
  return new Road(pattern, options);
}
