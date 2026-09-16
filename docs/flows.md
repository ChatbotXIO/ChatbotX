# Flow versions

This document describes the flow editor data model and the version lifecycle used by
the builder. It is the reference for draft editing, publishing, restoring older
versions, and reverting a draft back to the current published content.

## Tables

| Table | File | Role |
|---|---|---|
| `flowModel` | [`packages/database/src/schema/flow.ts`](../packages/database/src/schema/flow.ts) | Flow metadata and version pointers (`currentVersionId`, `draftVersionId`). |
| `flowVersionModel` | [`packages/database/src/schema/flow-version.ts`](../packages/database/src/schema/flow-version.ts) | Version payload (`nodes`, `edges`, `startNodeId`) plus lifecycle flags (`isDraft`, `isLatest`). |

## Invariants

- Exactly one draft row exists per flow: `flowVersionModel.isDraft = true`.
- At most one published row is current: `flowVersionModel.isDraft = false` and
  `flowVersionModel.isLatest = true`.
- `flowModel.currentVersionId` points to the current published version when one exists.
- Published rows are immutable snapshots. Editing only mutates the draft row.

## Lifecycle

| Operation | Code path | Behavior |
|---|---|---|
| Create | `createFlowAction` / public `flows.create` | Inserts the flow and a single draft version. The builder form and a bare API call seed it with a default start node; the public API can instead seed the draft with `{ spec }` or a raw `{ nodes, edges }` graph in the same call (see [Publish / validate workflow](#publish--validate-workflow)). No published version exists yet unless `publish: true` was sent. |
| Edit / autosave | `updateDraftFlowVersionAction` | Overwrites the draft row's `nodes` and `edges` from the canvas. |
| Publish | `publishFlowAction` | Copies the current draft content into a new published snapshot, marks it `isLatest`, and updates `currentVersionId`. |
| Restore older version | `flowVersionService.restore()` | Marks the chosen version as current published, updates `currentVersionId`, and copies that version's content into the draft row. |
| Revert draft to published | `flowVersionService.revertDraftToPublished()` | Copies the current published version's `nodes`, `edges`, and `startNodeId` back into the draft row without changing `currentVersionId` or the published pointer. |

## Cache

Published versions are cached under `flows:${flowId}:versions` via `withCache`
in [`packages/business/src/flow-version/service.ts`](../packages/business/src/flow-version/service.ts).

- `restore()` invalidates the versions cache because the published list changes.
- `publishFlowAction` invalidates the versions cache because it creates a new published snapshot.
- `revertDraftToPublished()` does not invalidate the versions cache because the published list does not change.

## Draft vs published equality

The flow editor decides whether the toolbar action can be used by comparing the draft
content to the current published content at page load. The page loads all versions,
finds the draft row and the current published row, and compares their serialized
`nodes`/`edges` using [`serializeFlowContent`](../apps/builder/src/features/flows/flow-version-content.ts).

That comparison is computed once when the page renders. After the user makes an edit,
the toolbar becomes enabled immediately (no reload needed). It also disables again
without a reload after a successful revert or restore, since the canvas content once
again equals the published content.

## Notes

- The canvas reset path used by restore and revert clears undo/redo history.
- The revert action is destructive from the user's perspective because it discards
  local draft work, so the builder shows a confirmation dialog before executing it.

## Flow-spec DSL (agent authoring)

Public API callers (typically an MCP agent) can author a flow as a compact JSON
document — the **flow-spec DSL** — instead of building the raw `{ nodes, edges }`
graph the builder canvas uses. The server compiles a spec into that same graph
shape before publishing or updating the draft, via
[`compileFlowSpec`](../packages/flow-config/src/authoring/compile.ts).

### Shape

```json
{
  "formatVersion": 1,
  "name": "Welcome flow",
  "channel": "whatsapp",
  "steps": [ /* FlowStepSpec[] */ ]
}
```

- `formatVersion` — always `1`.
- `channel` — optional; omit for omnichannel. `sendTemplate` steps always send over
  WhatsApp regardless of this value.
- `steps` — ordered, executed from the flow's start node. At least one required.

Validated by [`flowSpecSchema`](../packages/flow-config/src/authoring/spec-schema.ts).
`GET /v1/schemas/flow-spec` returns the same step-type documentation at runtime,
generated from each step schema's own `.describe()` rather than hand-maintained
here, so it cannot drift from the schema.

### Step types

| Type | Terminal? | Notes |
|---|---|---|
| `send` | No | Text, image, or file, with optional quick-reply `buttons`. Each button's `then` is a nested step list. |
| `sendTemplate` | No | Sends an existing WhatsApp template by `templateName`. The template must resolve (by name) to a workspace template with status `APPROVED`. |
| `wait` | No | Pauses for a duration before continuing. |
| `branch` | **Yes** | Contact-filter-style `cases` (`when`/`match`/`then`) plus an `otherwise`. Terminal within its own step list — nothing may follow a `branch` at the same level; continue inside `cases[].then` / `otherwise` instead. |
| `action` | No | A workspace side-effect: `addTags`, `removeTags`, `setCustomField`, `assignConversation`, `archiveConversation`. |
| `startFlow` | No | Starts another flow (by `flowName`); this flow keeps running afterward. |
| `addNote` | No | Adds an internal note to the conversation. |
| `goto` | **Yes** | Routes to an already-defined step's `id` instead of continuing linearly. See constraints below. |

"Terminal" means nothing may follow that step in the same step list — the compiler
reports `unreachableStep` for anything after it. A step list opening with a
non-terminal step continues into the node-level "Continue" edge by default.

### `goto` semantics and constraints

- Targets an earlier step's explicit `id` — set `id` on any step to make it a valid
  `goto` target. `goto` creates no node of its own; it returns the id of the node its
  target step already compiled to.
- **Cannot be the first step** in the whole spec (`invalidFirstStep`) — there is no
  earlier step yet to jump from.
- **Must reference a real, earlier-declared step id** (`invalidGotoTarget`) — an
  unknown or forward-referenced id fails with a candidates list of near-miss ids.
- **Cannot target the step immediately before it** (`selfLoopGoto`) — that would wire
  a node's "Continue" edge to itself (`source === target`), a self-loop
  `layoutNodes` can't position and that adds no behavior beyond letting the flow
  continue into the preceding step by default. Jumping back over an earlier step
  (not the one immediately before) is fine.
- **A step can target its own id from inside its own children** — e.g. a `send`
  step's button `then` can `goto` back to that same `send` step's `id` (a "Back to
  menu" pattern), and a `branch` case's `then` can `goto` back to its own `branch`
  step. This works because the compiler registers a step's `id → nodeId` mapping
  before compiling its nested children, not after.

### Publish / validate workflow

1. **`flows.create`** — accepts `name`/`folderId` plus, optionally, exactly one of
   `{ spec }` or a raw `{ nodes, edges }` graph to seed the draft in the same call
   (a body carrying both, or `edges` without `nodes`, is rejected with a 422 naming
   the offending key). For the raw graph shape, node `position`/`measured`, node
   ids, and edge `id`/handles are all optional or caller-arbitrary — filled in or
   remapped server-side by
   [`normalizeAuthoredGraph`](../packages/flow-config/src/authoring/normalize-graph.ts),
   which lays out positionless nodes with the same BFS `layoutNodes` the spec
   compiler uses, remaps every node's caller-supplied `id` to a fresh internal
   `createId()` id (a raw node's `id` is only a request-scoped token for wiring
   `edges` — it is never the persisted id, since persisted node ids are numeric
   snowflakes and a caller id like `"n1"` would otherwise fail `publishFlowSchema`),
   and defaults edge handles to the node-id convention `addHandleEdge` produces
   against the remapped ids. The response's `nodeIds` maps each authored id to
   its persisted id (present only for the raw-graph shape; omitted for `{
   spec }` input, which has no authored ids). Add `publish: true` to validate
   the resulting graph exactly like `flows.publish` and create the flow's
   first version in the same call — the flow, its draft version, and its
   published version are inserted in one transaction
   (`FlowService.createPublished`/`createPublishedDefault`), so a downstream
   failure never leaves an orphaned, unpublished flow behind. Omitting
   content or `publish` keeps today's default-start-node draft behavior.
2. **`flows.validate`** — compiles a `{ spec }` and validates the result exactly like
   `flows.publish` would, without persisting anything. On success it returns the
   compiled `{ nodes, edges }` graph; on failure a 422 with structured errors
   (`path`/`code`/`message`/`hint`/`candidates`), each `path` remapped back onto the
   *spec-relative* location (e.g. `steps[2].buttons[0].then[0]`) rather than a
   compiled-node path. Fix and retry before publishing.
3. **`flows.publish`** — accepts either the raw `{ nodes, edges }` graph the builder
   UI sends, or `{ spec }`; a request must send exactly one of the two shapes — a
   body carrying both is rejected with a 422 rather than silently discarding one of
   them. Creates an immutable version from the draft and syncs the draft to match.
4. **`flows.updateDraft`** — same either/or `{ nodes, edges }` vs `{ spec }`
   acceptance as `flows.publish`, but overwrites the draft in place without
   publishing; draft nodes are not otherwise validated. Unlike `flows.create`,
   a raw node's `id` is persisted **verbatim, not remapped** — it must already
   be a numeric string (`zodBigintAsString`), e.g. one returned by
   `flows.create`'s `nodeIds` response or a `flows.get` call.

The DSL compiler resolves `templateName`/`customFieldName`/`flowName` against the
**entire workspace**, not a possibly-truncated capabilities page — see
[`capabilities.get`](#capabilitiesget-workspace-discovery) below for how a caller
discovers valid names before authoring a spec.

## `capabilities.get` (workspace discovery)

`GET /v1/capabilities` — implemented by
[`getCapabilities`](../packages/business/src/capabilities/service.ts) — lets an
agent discover the named entities and reference data it needs before calling other
public APIs, in one compact, parallel-loaded response. It is the same shape of
problem `listContactFilterFieldsForAPI` solves for contact filters, generalized to
every named workspace entity an agent references by id.

### `include`

Accepts a subset of `CAPABILITIES_INCLUDES`: `inboxes`, `templates`,
`customFields`, `botFields`, `tags`, `aiAgents`, `sequences`, `flows`, `flowSpec`.
Omitting `include` fetches `DEFAULT_INCLUDES` — every entry except `aiAgents`, which
is opt-in only (rarely needed to build a flow, one `ai_agents_list` call away).

| `include` value | Returns |
|---|---|
| `inboxes` | `{ id, name, channel }[]` |
| `templates` | `{ id, name, language, status, params }[]` — WhatsApp message templates |
| `customFields` | `{ id, name, type }[]` |
| `botFields` | `{ id, name, type }[]` |
| `tags` | `{ id, name }[]` |
| `aiAgents` | `{ id, name }[]` |
| `sequences` | `{ id, name }[]` |
| `flows` | `{ id, name }[]` |
| `flowSpec` | Static reference data: `stepTypes` (derived from the DSL schema, see above), `waitUnits`, `channels` |

If a single loader fails (e.g. a malformed row), it is **omitted from the
response** rather than failing the whole call — `capabilities.get` runs its loaders
with `Promise.allSettled`, not `Promise.all`, and logs the failure server-side. A
missing key in the response can mean either "you didn't ask for it" or "that loader
failed"; there is no separate error signal per key today.

### Truncation

Every list this endpoint returns is capped at `CAPABILITIES_LIST_LIMIT` (200) —
this response is fed straight into an LLM's context window, so an unbounded list
(a workspace with thousands of tags) must never blow it up. **This cap is real and
enforced**: `inboxes`, `customFields`, `botFields`, `aiAgents`, `sequences`, and
`flows` all pass an explicit, stable `sort` (`id asc`) alongside the limit, so which
N rows you get back on a larger table is deterministic across calls. `tags` and
`templates` fetch the whole table and slice in memory (a known, tracked follow-up —
see the comments in `capabilities/service.ts`), so they are unbounded database
reads today even though the *response* is still capped at 200.

If your workspace has more than 200 of something, page through that resource's own
list endpoint instead (`tags.list`, `customFields.list`, `flows.list`, ...) —
`capabilities.get` is a discovery aid, not a paginated list API.

**This cap does not apply to what the flow-spec compiler itself sees.** The DSL
compiler's `FlowAuthoringContext` (`templatesByName`/`customFieldsByName`/
`flowsByName`, built by
[`getFlowAuthoringContext`](../packages/business/src/capabilities/service.ts))
fetches templates, custom fields, and flows **unbounded** — independent of, and via
different loaders than, the public `capabilities.get` response. This means: a
`flows.publish`/`flows.updateDraft`/`flows.validate` call with a spec that
references (by name) the 250th flow, template, or custom field in a workspace with
more than 200 will still resolve it correctly, even though `capabilities.get`
itself would have truncated that same entity out of its `flows`/`templates`/
`customFields` list. In other words: use `capabilities.get` to discover names for
authoring, but don't assume "not in the capabilities response" means "the compiler
won't accept it."

WhatsApp templates are unique per `name` + `language`, but the DSL's
`sendTemplate.templateName` has no language field to disambiguate. When two
language variants share a name, `getFlowAuthoringContext` deterministically prefers
the `APPROVED` variant (the only one the compiler would actually accept) over
whichever one happens to appear last in the underlying list.
