# relaxmerge

> Config-driven selective deep merge — per-field strategies, glob field filtering, and custom merges.

[![npm version](https://img.shields.io/npm/v/relaxmerge.svg)](https://www.npmjs.com/package/relaxmerge)
[![coverage](https://img.shields.io/badge/coverage-%3E90%25-brightgreen.svg)](#testing)

`relaxmerge` merges one object into another, but instead of a single global rule
it lets you decide **per field** how the merge happens: replace it, deep-merge
it, keep it, drill into it strictly or loosely, filter it by glob, or hand it to
your own callback.

## Why relaxmerge?

Most merge libraries apply one behavior to the whole tree. Real config merges
are messier: "take the remote theme, but never overwrite the local password, and
grow this list to match the remote one." That is exactly what a `MergeMap`
expresses.

|                             | `lodash.merge` | `deepmerge` | `relaxmerge`                     |
| --------------------------- | :------------: | :---------: | :------------------------------- |
| Deep merge                  |      yes       |     yes     | yes                              |
| Per-field strategy          |       no       |     no      | yes — `Strategy`                 |
| Glob field select / exclude |       no       |     no      | yes — `filter` / `pick` + `road` |
| Custom per-field merge      |       no       | global only | yes — `customize`                |

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

## 60-second tour

Remote config should override local defaults — except the password must stay
local, and the feature list should grow to the remote one:

```ts
import { merge, Strategy } from "relaxmerge";

const remote = { theme: "dark", password: "REMOTE", features: ["a", "b", "c"] };
const local = { theme: "light", password: "keep-me", features: ["x"] };

const result = merge(
  {
    theme: Strategy.Replace, // take the remote value
    password: Strategy.Skip, // never touch the local secret
    features: Strategy.Relax // grow the array to the remote length
  },
  remote, // source to pull from
  local // destination (mutated and returned)
);

// result === { theme: "dark", password: "keep-me", features: ["a", "b", "c"] }
```

`merge(map, config, own)` pulls values **from `config` into `own`** according to
`map`, and returns `own`.

### One real merge, most of the toolkit

A control plane pushes remote config onto an app that ships local defaults. Each
subtree needs a different rule — that is a single `merge` call:

```ts
import {
  merge,
  strict,
  filter,
  customize,
  moveField,
  Strategy
} from "relaxmerge";

// Defaults shipped with the app
const defaults = {
  service: { name: "billing", replicas: 1, timeoutMs: 3000 },
  db: { host: "localhost", port: 5432, password: "dev-secret" },
  featureFlags: { beta: false },
  telemetry: { endpoints: ["local"] },
  limits: { rps: 100 },
  contactEmail: "dev@local"
};

// Config pushed from the control plane
const remote = {
  service: {
    name: "billing",
    replicas: 8,
    timeoutMs: 10000,
    injected: "ignore-me"
  },
  db: { host: "prod-db.internal", port: 5432, password: "REMOTE-DO-NOT-USE" },
  featureFlags: { beta: true, secretExperiment: "internal" },
  telemetry: { endpoints: ["otel-1", "otel-2"] },
  limits: { rps: 5000 },
  meta: { contact: { email: "ops@corp.com" } } // buried deep in the remote payload
};

const config = merge(
  {
    // strict: only update fields the app already declares (drops `injected`)
    service: strict({
      replicas: Strategy.Replace,
      timeoutMs: Strategy.Replace
    }),
    // take remote host/port, but never the remote DB password
    db: {
      host: Strategy.Replace,
      port: Strategy.Replace,
      password: Strategy.Skip
    },
    // ship flags by glob, but keep anything matching `secret*` out
    featureFlags: filter({ includes: ["*"], excludes: ["secret*"] }),
    // grow the endpoint list to the remote one
    telemetry: { endpoints: Strategy.Relax },
    // clamp the pushed limit to a hard ceiling
    limits: {
      rps: customize(({ configValue }) => Math.min(configValue, 2000))
    },
    // flatten a deeply nested remote field up to a top-level key
    contactEmail: moveField("meta.contact.email")
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

| Strategy              | Meaning                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `Strategy.Replace`    | Overwrite `own` with the `config` value (unless config is `undefined`).           |
| `Strategy.MergeProto` | Deep-merge `own` and `config` at this path (via lodash `merge`).                  |
| `Strategy.Skip`       | Do not write; report the config value through `options.callback(key, value)`.     |
| `Strategy.Strict`     | Drill by the **own** side; only fill keys `own` already has.                      |
| `Strategy.Relax`      | Also drills by **own**; when walking children, unions own + config keys. May add missing **selected** leaves from config. Overwrites existing keys. |
| `Strategy.Customize`  | Hand the field to your callback (built with `customize`).                         |

Strict vs Relax in one line: Strict only follows keys the destination already
has; Relax also walks extra keys present on the source (and may materialize
missing selected leaves).

## API

All public exports:

### `merge(map, config, own, options?)`

Selectively pull fields from `config` into `own`.

```ts
merge({ a: Strategy.Replace }, { a: 1 }, { a: 2 }); // { a: 1 }
```

`options`: `{ callback?(key, value): void; sameTypeOnly?: boolean; state?: MergeState; context?: { scope?: string } }`.

`sameTypeOnly` defaults to `false`. Set it to `true` to preserve the 1.x behavior:
when both values are non-null, a different runtime type keeps the value from
`own`. Use `Skip` or `customize` for field-specific decisions.

`context.scope` is used by helpers such as `mergeFiltered` so `moveField` can
resolve **relative** source paths (see below).

### `mergeFiltered(filterOpts, remote, local)`

Merge with a `filter` rule without writing the `dumbNode` wrapper yourself.
Internally wraps both sides under `dumbNode` and sets `context.scope` so
`moveField('name')` resolves to `dumbNode.name`.

```ts
import { mergeFiltered, filter, moveField } from "relaxmerge";

const out = mergeFiltered(
  {
    excludes: ["name"],
    mergeMap: {
      user: { name: moveField("name") } // relative to dumbNode scope
    }
  },
  { name: "张三" },
  { user: { name: "" } }
);
// { user: { name: "张三" } }
```

Equivalent manual form (still supported):

```ts
merge(
  {
    dumbNode: filter({
      excludes: ["name"],
      mergeMap: { user: { name: moveField("dumbNode.name") } }
    })
  },
  { dumbNode: { name: "张三" } },
  { dumbNode: { user: { name: "" } } }
);
```

### `pick(options, obj)`

Filter a single object by include/exclude globs and get the kept part back.
`pick` is the standalone form of `filter`: it takes the same `FilterOptions`
(`includes` / `excludes` / `stated` / `mergeMap`) but you do not write a `merge`
call or a wrapper key yourself — use it whenever you just want to strip/keep
fields on one object.

```ts
pick({ excludes: "secret.**" }, { keep: 1, secret: { token: "x" } });
// { keep: 1 }

pick({ includes: ["user.*"] }, { user: { name: "a", pw: "x" }, other: 1 });
// { user: { name: "a", pw: "x" } }
```

Note: `filter` itself is a node and must live under a key inside a `merge`
(`merge({ x: filter(...) }, ...)`). To filter at the top level of an object with
no merge around it, reach for `pick` — do not pass a bare `filter(...)` as the
whole merge map.

### `relax(map)` / `strict(map)`

Create a nested node that drills with the Relax / Strict rule.

```ts
merge(
  { root: relax({ deep: Strategy.Relax }) },
  { root: { deep: { x: 1 } } },
  { root: {} }
);
```

### `filter(options?)`

A node that decides field-by-field which children take part, via globs.

```ts
filter({
  includes: ["settings.*"],
  excludes: ["settings.password"],
  stated: Strategy.Strict
});
```

`options`: `{ includes?, excludes?, stated?: Strategy.Strict | Strategy.Relax, mergeMap? }`.
`includes` / `excludes` accept a string glob or a prebuilt `Road` (or an array of
either).

### `customize(fn)`

Take full control of a field. `fn` receives a context object with at least
`{ path, own, config, configValue, ownValue, state, mergeNested }`, plus
`{ ctx, site, scope?, mode?, submap?, filter?, od?, cd?, selected, enclosed }`
when you need the full merge site snapshot.

`mergeNested(root, ownData, outsideData, nestedPath)` runs a nested merge at
`nestedPath` while the callback is active. Capture `path` / `site` at the start
of your callback if you need them after calling `mergeNested` — `ctx.site` is a
mutable pointer and moves with nested work.

```ts
merge(
  { a: customize(({ ownValue, configValue }) => ownValue + configValue) },
  { a: 10 },
  { a: 5 }
);
// { a: 15 }
```

### `moveField(beforePath, mergeRule?)`

Relocate a value from another path in the source into the current field. Use it
for renamed/moved config keys — pull `beforePath` from `config` and drop it here.

- `beforePath`: where to read the value from in `config`. When `options.context.scope`
  is set (as in `mergeFiltered`), a path without dots is resolved relative to that
  scope — `moveField("name")` reads `dumbNode.name`. Otherwise `beforePath` is
  absolute on the config root. If the source path is missing, falls back to this
  field's own `config` value, then to the existing `own` value.
- `mergeRule` (optional): when omitted, the moved value simply overwrites. When
  you pass a merge rule (a `MergeMap` or a `Strategy`), the moved value is merged
  once more into the destination's existing value using that rule.

```ts
// plain move: pull `srcVal` into `dest`
merge({ dest: moveField("srcVal") }, { srcVal: 42, dest: 0 }, { dest: 1 });
// { dest: 42 }

// move then re-merge the two objects with a rule
merge(
  { dest: moveField("src", { inner: Strategy.Relax }) },
  { src: { inner: 7 }, dest: {} },
  { dest: {} }
);
// { dest: { inner: 7 } }

// flatten a deeply nested source path up to here
merge({ contactEmail: moveField("meta.contact.email") }, { meta: { contact: { email: "ops@corp.com" } } }, {});
// { contactEmail: "ops@corp.com" }
```

### `road(pattern, options?)`

Compile a glob matcher. `road(pattern).test(path)` returns a boolean.

```ts
road("a.{number(1,3)}").test("a.2"); // true
```

### `Strategy`

The strategy enum (see the table above).

## road DSL cheat sheet

| Token               | Matches                                | Example                                                                   |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `*`                 | Exactly one path segment               | `road("a.*").test("a.b")` → `true`                                        |
| `**`                | Any depth, including zero segments     | `road("a.**").test("a.b.c")` → `true`                                     |
| `{number(min,max)}` | A numeric segment within `[min, max]`  | `road("a.{number(1,3)}").test("a.2")`                                     |
| `{a\|b}`            | One of the listed alternatives         | `road("a.{x\|y}").test("a.x")` → `true`                                   |
| `{exclude(x)}`      | Any segment except the excluded one(s) | `road("a.{exclude(skip)}").test("a.keep")`                                |
| `{customize(name)}` | A segment accepted by your predicate   | `road("a.{customize(even)}", { customize: { even: v => +v % 2 === 0 } })` |

Tokens compose freely, so you can target real-world paths:

```ts
import { road } from "relaxmerge";

// `**` in the middle: any depth between `a` and a trailing `id`
road("a.**.id").test("a.x.y.id"); // true
road("a.**.id").test("a.id"); // true  (** also matches zero segments)

// a numeric index somewhere in the path
road("list.{number}.name").test("list.0.name"); // true
road("list.{number}.name").test("list.x.name"); // false (not a number)

// pick one of several field names
road("{name|email|phone}").test("email"); // true
road("{name|email|phone}").test("age"); // false

// exclude several fields at once (| separated)
road("{exclude(id|createdAt)}").test("name"); // true
road("{exclude(id|createdAt)}").test("id"); // false
road("{exclude(id|createdAt)}").test("createdAt"); // false

// `*` is exactly one segment; use `**` for arbitrary depth
road("user.*.email").test("user.a.email"); // true
road("user.*.email").test("user.a.b.email"); // false

// custom predicate on the captured segment
const evenIndex = road("a.{customize(even)}", {
  customize: { even: (v) => +v % 2 === 0 }
});
evenIndex.test("a.4"); // true
evenIndex.test("a.5"); // false
```

These same patterns drive `filter` / `pick` under `includes` and `excludes`. A
string rule is compiled for you; to use a token that needs options (like
`{customize()}`), pass a prebuilt `Road` instead — its pattern is still resolved
relative to the field being filtered:

```ts
import { pick, road } from "relaxmerge";

const evenKeys = road("{customize(even)}", {
  customize: { even: (v) => +v % 2 === 0 }
});
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

const safe = pick(
  { excludes: ["settings.password", "settings.token"] },
  userConfig
);
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
  ui: { theme: "dark", lang: "en" }
};
const local = {
  server: { host: "localhost", port: 3000, secret: "local-secret" },
  ui: { theme: "light", lang: "en" }
};

merge(
  {
    server: {
      host: Strategy.Replace,
      port: Strategy.Replace,
      secret: Strategy.Skip // never pull the remote secret
    },
    ui: Strategy.Relax
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
  db: {
    primary: { host: "prod-db", password: "REMOTE" },
    replicas: ["r1", "r2"]
  }
};
const local = {
  db: { primary: { host: "localhost", password: "keep" }, replicas: ["r0"] }
};

merge(
  {
    db: {
      primary: { host: Strategy.Replace, password: Strategy.Skip },
      replicas: Strategy.Relax
    }
  },
  remote,
  local
);
// {
//   db: { primary: { host: "prod-db", password: "keep" }, replicas: ["r1", "r2"] },
// }
```

### 6. Compose freely: nodes inside nodes

Every node (`relax` / `strict` / `filter` / `customize` / `moveField`) is just a
value in a `MergeMap`, so they nest arbitrarily. A `filter` routes specific
fields to other nodes through its `mergeMap`, and a `customize` callback is plain
code — call `merge` / `pick` / build a `filter` inside it if you want:

```ts
import { merge, filter, strict, customize, Strategy } from "relaxmerge";

merge(
  {
    cfg: filter({
      includes: ["**"], // see the note below — use ** to reach nested fields
      mergeMap: {
        user: strict({ name: Strategy.Replace }),                    // filter -> strict
        score: customize(({ ownValue, configValue }) => ownValue * configValue), // filter -> customize
        inner: filter({ includes: ["**"], excludes: ["pw"] }),       // filter -> filter
      },
    }),
  },
  { cfg: { keep: "r", user: { name: "R", extra: "x" }, score: 3, inner: { a: "R", pw: "R" } } },
  { cfg: { keep: "l", user: { name: "l" },            score: 4, inner: { a: "l", pw: "keep" } } }
);
// {
//   cfg: {
//     keep: "r",
//     user: { name: "R" },        // strict dropped `extra`
//     score: 12,                  // customize: 3 * 4
//     inner: { a: "R", pw: "keep" }, // inner filter kept `pw` out
//   },
// }
```

> Gotcha: a `filter`'s `includes` / `excludes` keep applying to its **entire
> subtree**. Use `**` (not `*`) in `includes` when you nest deeper, otherwise
> deep fields never match the include rule and get dropped before your nested
> nodes ever see them.

### 7. Relocate a field with `mergeFiltered` + `moveField`

When the remote payload has a flat field but local expects it nested — exclude the
old path, then move it with a relative `moveField` under `mergeFiltered`:

```ts
import { mergeFiltered, moveField } from "relaxmerge";

const result = mergeFiltered(
  {
    excludes: ["name"],
    mergeMap: {
      user: { name: moveField("name") }
    }
  },
  { name: "张三" },
  { user: { name: "" } }
);
// { user: { name: "张三" } }
```

`mergeMap` entries win over `excludes` for the same path, so `user.name` is still
processed even though `name` is excluded at the root.


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
