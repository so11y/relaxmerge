# relaxmerge

> Config-driven selective deep merge — per-field strategies, glob field filtering, and custom merges.

[![npm version](https://img.shields.io/npm/v/relaxmerge.svg)](https://www.npmjs.com/package/relaxmerge)
[![bundle size](https://img.shields.io/bundlephobia/minzip/relaxmerge)](https://bundlephobia.com/package/relaxmerge)
[![coverage](https://img.shields.io/badge/coverage-%3E90%25-brightgreen.svg)](#testing)
[![license](https://img.shields.io/npm/l/relaxmerge.svg)](./LICENSE)

`relaxmerge` merges one object into another, but instead of a single global rule
it lets you decide **per field** how the merge happens: replace it, deep-merge
it, keep it, drill into it strictly or loosely, filter it by glob, or hand it to
your own callback.

## Why relaxmerge?

Most merge libraries apply one behavior to the whole tree. Real config merges
are messier: "take the remote theme, but never overwrite the local password, and
grow this list to match the remote one." That is exactly what a `MergeMap`
expresses.

|                                | `lodash.merge` | `deepmerge` | `relaxmerge`            |
| ------------------------------ | :------------: | :---------: | :---------------------- |
| Deep merge                     |       yes      |     yes     | yes                     |
| Per-field strategy             |       no       |      no     | yes — `Strategy`        |
| Glob field select / exclude    |       no       |      no     | yes — `filter` / `pick` + `road` |
| Custom per-field merge         |       no       |  global only | yes — `customize`      |

The `road` glob DSL (`*`, `**`, `{number(min,max)}`, `{a|b}`, `{exclude(...)}`,
`{customize(...)}`) is the part other libraries simply do not have.

## Install

```bash
npm install relaxmerge
# or
pnpm add relaxmerge
# or
yarn add relaxmerge
```

Ships both ESM and CommonJS builds plus TypeScript types. `lodash-es` is a peer
runtime dependency and is kept external, so it is not bundled twice.

## 60-second tour

Remote config should override local defaults — except the password must stay
local, and the feature list should grow to the remote one:

```ts
import { merge, Strategy } from "relaxmerge";

const remote = { theme: "dark", password: "REMOTE", features: ["a", "b", "c"] };
const local  = { theme: "light", password: "keep-me", features: ["x"] };

const result = merge(
  {
    theme: Strategy.Replace, // take the remote value
    password: Strategy.Skip, // never touch the local secret
    features: Strategy.Relax, // grow the array to the remote length
  },
  remote, // source to pull from
  local   // destination (mutated and returned)
);

// result === { theme: "dark", password: "keep-me", features: ["a", "b", "c"] }
```

`merge(map, config, own)` pulls values **from `config` into `own`** according to
`map`, and returns `own`.

### One real merge, most of the toolkit

A control plane pushes remote config onto an app that ships local defaults. Each
subtree needs a different rule — that is a single `merge` call:

```ts
import { merge, strict, filter, customize, moveField, Strategy } from "relaxmerge";

// Defaults shipped with the app
const defaults = {
  service: { name: "billing", replicas: 1, timeoutMs: 3000 },
  db: { host: "localhost", port: 5432, password: "dev-secret" },
  featureFlags: { beta: false },
  telemetry: { endpoints: ["local"] },
  limits: { rps: 100 },
  contactEmail: "dev@local",
};

// Config pushed from the control plane
const remote = {
  service: { name: "billing", replicas: 8, timeoutMs: 10000, injected: "ignore-me" },
  db: { host: "prod-db.internal", port: 5432, password: "REMOTE-DO-NOT-USE" },
  featureFlags: { beta: true, secretExperiment: "internal" },
  telemetry: { endpoints: ["otel-1", "otel-2"] },
  limits: { rps: 5000 },
  meta: { contact: { email: "ops@corp.com" } }, // buried deep in the remote payload
};

const config = merge(
  {
    // strict: only update fields the app already declares (drops `injected`)
    service: strict({ replicas: Strategy.Replace, timeoutMs: Strategy.Replace }),
    // take remote host/port, but never the remote DB password
    db: { host: Strategy.Replace, port: Strategy.Replace, password: Strategy.Skip },
    // ship flags by glob, but keep anything matching `secret*` out
    featureFlags: filter({ includes: ["*"], excludes: ["secret*"] }),
    // grow the endpoint list to the remote one
    telemetry: { endpoints: Strategy.Relax },
    // clamp the pushed limit to a hard ceiling
    limits: { rps: customize(({ configValue }) => Math.min(configValue, 2000)) },
    // flatten a deeply nested remote field up to a top-level key
    contactEmail: moveField("meta.contact.email"),
  },
  remote,
  defaults
);

// config === {
//   service: { name: "billing", replicas: 8, timeoutMs: 10000 },
//   db: { host: "prod-db.internal", port: 5432, password: "dev-secret" },
//   featureFlags: { beta: true },
//   telemetry: { endpoints: ["otel-1", "otel-2"] },
//   limits: { rps: 2000 },
//   contactEmail: "ops@corp.com",
// }
```

## Core concepts

### MergeMap

A `MergeMap` mirrors the shape of your data. Each key maps to one of:

- a `Strategy` enum value (a leaf rule),
- a nested `MergeMap` (drill down further),
- a node built by `relax` / `strict` / `filter` / `customize` / `moveField`.

### The six strategies

| Strategy            | Meaning                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `Strategy.Replace`  | Overwrite `own` with the `config` value (unless config is `undefined`).         |
| `Strategy.MergeProto` | Deep-merge `own` and `config` at this path (via lodash `merge`).              |
| `Strategy.Skip`     | Do not write; report the config value through `options.callback(key, value)`.   |
| `Strategy.Strict`   | Drill by the **own** side; only fill keys `own` already has.                     |
| `Strategy.Relax`    | Drill by the **config** side; array lengths may differ. Overwrites existing keys. |
| `Strategy.Customize`| Hand the field to your callback (built with `customize`).                        |

Strict vs Relax in one line: Strict respects the destination's shape, Relax
follows the source's shape.

## API

All nine exports:

### `merge(map, config, own, options?)`

Selectively pull fields from `config` into `own`.

```ts
merge({ a: Strategy.Replace }, { a: 1 }, { a: 2 }); // { a: 1 }
```

`options`: `{ callback?(key, value): void; state?: MergeState }`.

### `pick(options, obj)`

Filter a single object by include/exclude globs; returns the kept part.

```ts
pick({ excludes: "secret.**" }, { keep: 1, secret: { token: "x" } });
// { keep: 1 }
```

### `relax(map)` / `strict(map)`

Create a nested node that drills with the Relax / Strict rule.

```ts
merge({ root: relax({ deep: Strategy.Relax }) }, { root: { deep: { x: 1 } } }, { root: {} });
```

### `filter(options?)`

A node that decides field-by-field which children take part, via globs.

```ts
filter({ includes: ["settings.*"], excludes: ["settings.password"], stated: Strategy.Strict });
```

`options`: `{ includes?, excludes?, stated?: Strategy.Strict | Strategy.Relax, mergeMap? }`.
`includes` / `excludes` accept a string glob or a prebuilt `Road` (or an array of
either).

### `customize(fn)`

Take full control of a field. `fn` receives `{ path, own, config, configValue, ownValue, state, mergeNested }`.

```ts
merge({ a: customize(({ ownValue, configValue }) => ownValue + configValue) }, { a: 10 }, { a: 5 });
// { a: 15 }
```

### `moveField(beforePath, anyUse?)`

Move a value from another path into this one; optionally re-merge with a map or strategy.

```ts
merge({ dest: moveField("srcVal") }, { srcVal: 42, dest: 0 }, { dest: 1 }); // { dest: 42 }
```

### `road(pattern, options?)`

Compile a glob matcher. `road(pattern).test(path)` returns a boolean.

```ts
road("a.{number(1,3)}").test("a.2"); // true
```

### `Strategy`

The strategy enum (see the table above).

## road DSL cheat sheet

| Token               | Matches                                             | Example                                  |
| ------------------- | --------------------------------------------------- | ---------------------------------------- |
| `*`                 | Exactly one path segment                            | `road("a.*").test("a.b")` → `true`       |
| `**`                | Any depth, including zero segments                  | `road("a.**").test("a.b.c")` → `true`    |
| `{number(min,max)}` | A numeric segment within `[min, max]`               | `road("a.{number(1,3)}").test("a.2")`    |
| `{a\|b}`            | One of the listed alternatives                      | `road("a.{x\|y}").test("a.x")` → `true`  |
| `{exclude(x)}`      | Any segment except the excluded one(s)              | `road("a.{exclude(skip)}").test("a.keep")` |
| `{customize(name)}` | A segment accepted by your predicate                | `road("a.{customize(even)}", { customize: { even: v => +v % 2 === 0 } })` |

Tokens compose freely, so you can target real-world paths:

```ts
import { road } from "relaxmerge";

// `**` in the middle: any depth between `a` and a trailing `id`
road("a.**.id").test("a.x.y.id"); // true
road("a.**.id").test("a.id");     // true  (** also matches zero segments)

// a numeric index somewhere in the path
road("list.{number}.name").test("list.0.name"); // true
road("list.{number}.name").test("list.x.name"); // false (not a number)

// pick one of several field names
road("{name|email|phone}").test("email"); // true
road("{name|email|phone}").test("age");   // false

// exclude several fields at once (| separated)
road("{exclude(id|createdAt)}").test("name");      // true
road("{exclude(id|createdAt)}").test("id");        // false
road("{exclude(id|createdAt)}").test("createdAt"); // false

// `*` is exactly one segment; use `**` for arbitrary depth
road("user.*.email").test("user.a.email");   // true
road("user.*.email").test("user.a.b.email"); // false

// custom predicate on the captured segment
const evenIndex = road("a.{customize(even)}", { customize: { even: v => +v % 2 === 0 } });
evenIndex.test("a.4"); // true
evenIndex.test("a.5"); // false
```

These same patterns drive `filter` / `pick` under `includes` and `excludes`. A
string rule is compiled for you; to use a token that needs options (like
`{customize()}`), pass a prebuilt `Road` instead — its pattern is still resolved
relative to the field being filtered:

```ts
import { pick, road } from "relaxmerge";

const evenKeys = road("{customize(even)}", { customize: { even: v => +v % 2 === 0 } });
pick({ includes: [evenKeys] }, { 0: "a", 1: "b", 2: "c", 3: "d" });
// { 0: "a", 2: "c" }
```

## Recipes

### 1. Remote config overrides local defaults

See the 60-second tour above: `Replace` for values you want from remote, `Skip`
for secrets, `Relax` for lists.

### 2. Strip sensitive fields

```ts
import { pick } from "relaxmerge";

const safe = pick({ excludes: ["settings.password", "settings.token"] }, userConfig);
```

### 3. Merge arrays by strategy

```ts
merge({ list: Strategy.Relax }, { list: [1, 2, 3] }, { list: [9] }); // { list: [1, 2, 3] }
merge({ list: Strategy.Strict }, { list: [1, 2, 3] }, { list: [9] }); // { list: [1] }
```

### 4. Nested MergeMap with per-field strategies

The `MergeMap` mirrors your data shape, so you can mix strategies at any depth.
Here a `server` subtree takes the remote host/port but keeps the local secret,
while the whole `ui` subtree follows Relax:

```ts
import { merge, Strategy } from "relaxmerge";

const remote = {
  server: { host: "prod.example.com", port: 8080, secret: "REMOTE" },
  ui: { theme: "dark", lang: "en" },
};
const local = {
  server: { host: "localhost", port: 3000, secret: "local-secret" },
  ui: { theme: "light", lang: "en" },
};

merge(
  {
    server: {
      host: Strategy.Replace,
      port: Strategy.Replace,
      secret: Strategy.Skip, // never pull the remote secret
    },
    ui: Strategy.Relax,
  },
  remote,
  local
);
// {
//   server: { host: "prod.example.com", port: 8080, secret: "local-secret" },
//   ui: { theme: "dark", lang: "en" },
// }
```

### 5. Deep nesting with a protected leaf and a merged list

Strategies compose three levels down. The DB password stays local, the primary
host is replaced, and the replica list grows to the remote one:

```ts
import { merge, Strategy } from "relaxmerge";

const remote = {
  db: { primary: { host: "prod-db", password: "REMOTE" }, replicas: ["r1", "r2"] },
};
const local = {
  db: { primary: { host: "localhost", password: "keep" }, replicas: ["r0"] },
};

merge(
  {
    db: {
      primary: { host: Strategy.Replace, password: Strategy.Skip },
      replicas: Strategy.Relax,
    },
  },
  remote,
  local
);
// {
//   db: { primary: { host: "prod-db", password: "keep" }, replicas: ["r1", "r2"] },
// }
```

## TypeScript, ESM & CJS

Written in TypeScript with bundled `.d.ts`. Works from both `import` and
`require`:

```ts
import { merge } from "relaxmerge";     // ESM
const { merge } = require("relaxmerge"); // CJS
```

## Testing

```bash
npm test        # run the suite in watch mode
npm run test:cov # run once with coverage (lines/branches >= 90%)
```

The suite is organized as per-module unit tests with explicit assertions that
lock every documented behavior.

## Contributing

```bash
npm install
npm run build      # vite library build -> dist/
npm run typecheck  # tsc --noEmit
npm test
```

## License

MIT
