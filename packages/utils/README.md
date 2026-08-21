# @chatbotx.io/utils

Generic, domain-agnostic helpers shared across the workspace: id generation, crypto,
datetime/timezone math, request parsing, base62 encoding, concurrency, etc. This
package has **zero internal workspace dependencies** — keep it that way. Anything
that needs another `@chatbotx.io/*` package belongs somewhere else.

## Exception: cross-cutting product enums (`channel.ts`, `custom-field.ts`)

`ChannelType`/`CHANNEL_CAPABILITIES` (`./channel`) and `CustomFieldType`
(`./custom-field`) are product/business concepts, not generic utilities — they
live here only because of a dependency-direction constraint:

- `packages/flow-config` needs these enums (channel rules, custom-field step
  config) but must not depend on `packages/database`.
- `packages/database` already depends on `packages/flow-config`.
- So `database -> flow-config -> database` would be circular if the enum lived
  in `database` and `flow-config` imported it from there.

`packages/utils` is the shared ancestor both can reach without a cycle, so the
enum is defined here and `packages/database/src/partials/{channel,custom-field}.ts`
re-exports it unchanged for the rest of the codebase's existing import sites.

**Do not use this as precedent to add other business logic here.** Only a bare
enum (plus small derived, purely-structural constants like `CHANNEL_CAPABILITIES`)
qualifies for this exception — no data access, no I/O, no service-layer logic.
If a new cross-cutting concept needs more than an enum, it likely needs its own
package instead of expanding this one.
