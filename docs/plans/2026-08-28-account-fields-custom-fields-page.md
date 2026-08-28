# Account Fields (Bot Fields) — v4 CONSOLIDATED PLAN

Status: DRAFT — awaiting user confirmation. (v1→v3 history squashed; v3 reviewed by Codex,
all findings incorporated. This v4 adds the user's code-quality requirements as concrete
design decisions and is submitted for Codex review round 2.)

## 1. Requirements

1. `/space/{workspaceId}/custom-fields`: add an **Account Fields** card below the Custom
   Fields card (Chatrace: "account fields"; ManyChat/Ahachat: "bot field"). Columns:
   checkbox, Name, Type, Value, row-actions menu; Add button; search — per screenshot.
2. No new table; the value lives on the field row itself, NOT in `ContactCustomField`.
   → Reuse the existing `BotField` table (decision confirmed with user; ManyChat splits
   bot fields/user fields the same way; Chatwoot's single-definitions-table pattern does
   not apply because its values never live on the definition row).
3. Chatrace parity: pickers in flow steps, trigger actions, etc. return **one combined
   list** (custom fields + account fields); the **backend detects the kind and routes**.
4. Inbox and every contact-scoped surface must NOT see account fields.
5. Code-quality bar (user-mandated): modular, registry/enum-driven dispatch (no if-else
   ladders), no channel hard-coding in shared files, reuse existing handlers (refine, not
   duplicate), business-layer only (no direct `db` in apps), no `any`, no raw SQL string
   concatenation (Drizzle parameterized only), must not break existing flows, must handle
   chatbot-scale concurrency, and every case covered by tests.

## 2. Verified current state (all claims checked against code)

**Already exists (reuse, don't rebuild):**
- `BotField` table: `name`, `type` (shared `customFieldType` enum), `value`, `description`,
  `folderId` (shares `customField` folder namespace), `workspaceId`, unique
  `(workspaceId, type, name)` — `packages/database/src/schema/bot-field.ts`. In the initial
  migration → **zero new migrations**.
- `botFieldService` (`packages/business/src/bot-field/service.ts`): list/find/findByKey
  (id-or-name via `REGEX_BOT_FIELD_ID`)/create/updateByKey/bulkUpdateByKeys/deleteByKey,
  Redis `withCache` + tag invalidation (`bot-fields:{workspaceId}:*`).
- Full CRUD UI in `apps/builder/src/features/bot-fields/` (table, dialogs,
  `BotFieldValueInput`), workspace-token public API, template install support
  (`template/adapters/settings.ts` creates bot fields).
- Remap engine already supports prefixed reference tokens (`fn:`/`file:`/`mcp:` in
  `packages/flow-config/src/import-export/reference-fields.ts`).

**Known defects to fix first (verified file:line):**
- `botFieldService.list()` sorts and `$count`s against `customFieldModel` instead of
  `botFieldModel` (service.ts:62,70) → wrong pageCount.
- `UpdateBotFieldDialog` does not bind/render `value`
  (`update-bot-field-dialog.tsx:~74–78`, commented out) → Value not editable.
- `botFieldService.deleteByKey` **deletes the row** (service.ts:226→bulkDelete:254);
  there is no clear-value API.
- No value-operation semantics exist anywhere (append/prepend/increase/decrease).
  Pre-existing platform bug (OUT of this feature's scope unless user opts in):
  flow `setCustomField` handler drops `step.operation`
  (`apps/worker/src/integration/handlers/contact.ts:61`) and trigger `ActionExecutor`
  silently no-ops O02–O05 (`action-executor.ts:151–155`).
- The page `/space/:id/bot-fields` is an orphan route (no tab/menu links to it).

**Write-path reality (Codex-verified):** the four `contactCustomFieldService` entry points
(`setValueByKey`, `setValues`, `deleteByKey`, `deleteByCustomFieldId`) are the final write
chokepoints, BUT several step handlers read/validate `customFieldModel` /
`contactCustomFieldModel` directly BEFORE writing (tool-handler `countCharacters:49`,
`formatDate:91`, `getDataFromJSON:165`; `javascript-execution/service.ts:43` preflight).
Chokepoint routing alone therefore covers only steps without preflight reads.

## 3. Core design

### 3.1 Field reference model (shared, channel-agnostic)

New module `packages/flow-config/src/field-reference.ts` (pure, no channel logic):

```ts
export const FieldReferenceKind = { customField: "customField", botField: "botField" } as const
export type FieldReferenceKind = (typeof FieldReferenceKind)[keyof typeof FieldReferenceKind]

export const BOT_FIELD_REFERENCE_PREFIX = "bot_field" // token form: bot_field:<id>

export type FieldReference =
  | { kind: typeof FieldReferenceKind.customField; key: string } // id or name (legacy behavior)
  | { kind: typeof FieldReferenceKind.botField; id: string }

export const parseFieldReference = (raw: string): FieldReference
export const formatBotFieldReference = (id: string): string   // `bot_field:${id}`
// NOT a digits-only regex: legacy flows store field NAMES in inputFieldId (any non-empty
// string; contactCustomFieldService also resolves by name). Widening must keep every
// stored value valid while banning only a malformed reserved prefix:
export const zodFieldReference = () =>
  z.string().trim().min(1)
    .refine((v) => !v.startsWith(`${BOT_FIELD_REFERENCE_PREFIX}:`) ||
      new RegExp(`^${BOT_FIELD_REFERENCE_PREFIX}:\\d+$`).test(v))
```

- Discriminated union + exhaustive `switch` (compiler-checked), no `any`, no if-else chains.
- Why prefix, not raw id: the remap engine classifies scalar reference slots **by key name**
  (`inputFieldId` → `"customField"`); a raw bot-field id would be remapped against the wrong
  idMap on template install/flow import and silently break. `bot_field:` follows the existing
  `fn:`/`file:`/`mcp:` precedent.

### 3.2 Business-layer routing (registry, not if-else; refine existing functions)

- `botFieldService` gains (Phase 0):
  - `applyValueOperation({ workspaceId, id, operation, value })` — operation dispatch via a
    handler map `Record<FieldOperationType, ValueOperationHandler>` (registry per user
    requirement, mirrors `FieldOperationType` enum). Temporal normalization reuses
    `resolveTemporalCustomFieldSaveFormat` utilities — no duplicate logic.
  - `clearValueByKey` — `value = null` (row deletion remains a separate admin API).
  - **Concurrency (chatbot-scale)**: `increase`/`decrease`/`append`/`prepend` run as a single
    atomic Drizzle UPDATE expression (parameterized `sql` operators — no read-modify-write
    race across worker replicas, no raw string SQL → no injection).
- Routing placement (revised twice after caller audits — final): **capability is opt-in per
  caller, never ambient**. `setValueByKey` / `deleteByKey` gain an options field
  `allowBotFields?: boolean` (default **false**). Only when true is `parseFieldReference`
  consulted; botField branch delegates to `botFieldService`; customField branch is the
  EXISTING code path untouched (refine, don't fork — old flows keep byte-identical
  behavior). With the default, a `bot_field:` token falls through to the legacy name-lookup
  and fails with the existing notFound error.
- Why opt-in even at the keyword chokepoints: the PUBLIC workspace-token API
  `DELETE /v1/contacts/{identifier}/custom-fields/{idOrName}`
  (`contacts/api/workspace-token.ts:322,341`) and the rich-response action executor
  (`rich-response/action-executor.ts:99,115`) pass arbitrary strings into
  `setValueByKey`/`deleteByKey`. Ambient prefix parsing would let a contact-only public
  endpoint mutate Account Fields. Default-false makes contact-purity structural.
- v1 callers passing `allowBotFields: true` (exactly four): flow set step, flow clear step
  (`handlers/contact.ts:61,82`), Get User Data (`get-user-data.ts:146,269` — verified: no
  customFieldModel preflight).
- **Do NOT touch the id-based `setValues` / `deleteByCustomFieldId`**: 20+ contact-scoped
  callers (minigame, questionnaire, WhatsApp-Flow response, dynamic-image, AI tools,
  spreadsheet, contact actions, workspace-token bulk API). They stay contact-pure.
- Trigger `ActionExecutor` (the only v1 surface feeding raw UI-chosen references into
  `setValues`/`deleteByCustomFieldId`): dispatch via `parseFieldReference` AT the executor —
  botField branch → `botFieldService.applyValueOperation`/`clearValueByKey`, customField
  branch → existing calls unchanged.
- **Operation × type policy** (registry enforces; invalid combos raise the existing
  exception type): `set` — all types; `append`/`prepend` — text only; `increase`/
  `decrease` — number only; boolean/date/datetime accept only `set` (temporal
  normalization runs BEFORE the update, reusing existing datetime utilities). Atomic
  parameterized Drizzle `sql` UPDATE (`concat`/`coalesce` for append/prepend, numeric cast
  for inc/dec) with `WHERE workspaceId AND id`, `.returning()`, then tag invalidation;
  a historical non-numeric value under inc/dec fails predictably (tested).
- No `apps/` code touches `db`; everything stays behind `@chatbotx.io/business`.

### 3.3 Combined picker (UI), opt-in allowlist

- `useCustomFieldSelectOptions` / `CustomFieldSelect` / `CustomFieldField`: new
  `includeBotFields?: boolean` (default **false**). When true, return **grouped options**
  using the existing native mechanism — `SelectOption.children` renders as a
  `CommandGroup` with a heading in `ComboboxField` (combobox-field.tsx:190-203; precedent:
  `useFlowNodesSelectOptions`, `MultiSelectGroup`). Group order: "System Fields" (when
  `includeReserved`) → "Custom Fields" → "Account Fields" (values =
  `formatBotFieldReference(id)`). Search spans groups (ComboboxField flattens for lookup).
  Constraint: `SelectField` does NOT render `children` (it flattens groups), so grouped
  output is emitted ONLY on the `includeBotFields` path — every v1 surface renders via
  `ComboboxField`; the ~24 existing flat-list consumers keep their current shape untouched.
  Group headings via `useTranslations()` (i18n keys, all locales).
- Store: extend the existing custom-field zustand store with `botFields` — **lazy-loaded**
  (`ensureBotFieldsLoaded()` invoked from the options hook only when `includeBotFields` is
  true), with its own `botFieldsLoading`/`botFieldsError` state and in-flight dedupe so
  multiple pickers on one page trigger one fetch. `initialize()` stays custom-fields-only:
  `CustomFieldStoreProvider` is mounted on ~20 pages including inbox
  (custom-field-store-context.tsx:40, inbox/page.tsx:44); eager fetching would add a wasted
  request per page view at chatbot scale.
- Field-type lookup (operation options, temporal hints) resolves through one helper
  `findFieldByReference(reference, { customFields, botFields })` — shared, tested.
- Allowlist v1 (everything else stays default-off): flow steps `set-custom-field`,
  `clear-custom-field`, `get-user-data`; trigger actions `setCustomField`,
  `clearCustomField`.

### 3.4 Export / import / template install (full spec)

- `reference-fields.ts`: register `bot_field → "botField"` in
  `PREFIXED_REFERENCE_ENTITY_KIND`; scalar-slot value dispatch — in `remapEntry`
  (`remap.ts:219`) the scalar resolver must recognize a valid `bot_field:` token **before**
  the generic customField remap (ordering matters: today the scalar `customField` path runs
  first and would swallow the token), resolve against `idMaps.botField`, re-serialize with
  the prefix (helper shared by walkers).
- `references.ts`: `collectCustomFieldReferences` currently returns `string[]` of numeric
  ids only (references.ts:62,90) — replace with a typed collector returning
  `{ customFieldIds: string[]; botFieldIds: string[] }` (keep the old export as a thin
  wrapper if external callers exist; grep first).
- Flow export route (`flows/[id]/export/route.ts:75`): stop assuming all collected ids are
  custom fields; emit a `botFields` manifest (name/type keyed like custom fields).
  `flowExportSchema.botFields` uses `.default({})` so OLD exports without the key still
  parse; a token with no manifest entry stays untouched + warning (no format-version bump).
- Flow import worker (`flow-import.ts`) + `FlowService.importFlowExport`: resolve-or-create
  bot fields by `(name, type)` (mirror `customFieldService.resolveByNameAndType` policy),
  build `idMaps.botField`, remap, invalidate, warn on misses.
- **Template snapshot dependency ordering** (Codex r2): `settingsAdapter` currently has
  `providesKinds: []` and only `ctx.track()`s created bot fields (settings.ts:37,73) —
  it must declare `providesKinds: ["botField"]` AND populate `ctx.idMaps.botField`
  (sourceId → createdId) at creation. `flowsAdapter` must consume `"botField"` and the flow
  exporter's `collect()` must return the exact `TemplateHardDependency` shape
  (`adapters/types.ts:63`): `hardDependencies: dedupe(botFieldIds).map((sourceId) =>
  ({ category: "settings", sourceId }))` — a flows-only snapshot then pulls its referenced
  bot fields in and installs in dependency order.
- Tests: round-trip export→import same workspace / cross workspace / old export without
  `botFields` key; snapshot flows-only, settings+flows, install ordering + idMap.

### 3.5 What stays contact-only (negative guarantees)

Inbox contact panel, contact filter/segments/audiences, contact import/export mapping,
CRM sync (ActiveCampaign/Mailchimp/Drip/GetResponse/Klaviyo), lead-ads mapping,
questionnaire/WhatsApp-Flow response mapping (`whatsapp-flow-response/service.ts` hard
contact semantics), minigames, dynamic images, condition step, CustomFieldValueChanged /
DateTime triggers. Each keeps `includeBotFields` unset AND gets a negative test where a
`bot_field:*` token must be rejected (`zodFieldReference` not applied there; existing
digit-only schemas keep rejecting it — a structural guarantee, not just convention).

## 4. Phases

### Phase 0 — Fix pre-existing bot-field defects (blockers)
1. `botFieldService.list`: use `botFieldModel` for orderBy + `$count` (+ regression test).
2. `UpdateBotFieldDialog`: bind `value` via `BotFieldValueInput`.
3. Add `applyValueOperation` (registry dispatch, atomic UPDATE) + `clearValueByKey`
   (+ unit tests: 5 operations × text/number/temporal, concurrent increase test).

### Phase 1 — Account Fields card on `/custom-fields`
1. RSC wrapper `listBotFieldsRSC` (auth via `assertCurrentUserCanAccessChatbot`), fetch-all
   with documented hard cap (500) — `useDataTable` hard-codes `page`/`perPage`/`sort` URL
   keys, so the second table must be client-driven to avoid param collision.
2. `AccountFieldsCard` client component (client-side search/pagination via React state),
   reusing existing dialogs + `CustomFieldTypeLabel`. Columns per screenshot.
3. i18n `accountFields.*` keys in ALL locale files (title "Account Fields").
4. Delete orphan route `/space/[workspaceId]/(has-folder)/bot-fields/` (pending user OK).

### Phase 2 — Private API + store
1. `features/bot-fields/api/private.ts`: `GET /workspaces/{workspaceId}/bot-fields`
   (`authorizedAPI` + `workspaceAuthorizedMidddleware` — triple-d), mirroring
   custom-fields `private.ts`; register in `routers/index.ts`.
2. Store: add `botFields` + fetch; expose through `CustomFieldStoreProvider` (no new
   provider — refine existing).

### Phase 3 — Field reference module + picker
1. `field-reference.ts` in flow-config (3.1) + unit tests (parse/format/zod edge cases:
   empty, `bot_field:`, `bot_field:abc`, plain name, numeric id).
   Reserved-name guard + rollout audit: field `name` schemas currently accept any 1–255
   chars — a field literally named `bot_field:123` would collide with reference tokens.
   (a) Add a refine to the create/update `name` schemas of BOTH custom fields and bot
   fields rejecting names starting with the reserved prefix. (b) **Rollout audit step
   (before enabling the feature)**: one-off read-only check that no existing
   `CustomField.name`/`BotField.name` starts with `bot_field:` and no stored flow version /
   trigger action holds a reference value starting with `bot_field:` that is not a valid
   token (expected result: zero rows; if any exist, rename via the normal update API before
   rollout). Only after (a)+(b) may the widening be called backward-compatible — the claim
   is verified, not assumed.
2. Picker opt-in + "Account Fields" group + `findFieldByReference` helper.
3. Widen `set-custom-field.ts` / `clear-custom-field.ts` trigger schemas and flow-config
   step schemas to `zodFieldReference()` (backward compatible — all stored values still
   validate; verify no other consumer of those exact schema objects narrows on digits).

### Phase 4 — Backend routing (v1 write surfaces)
1. `setValueByKey`/`deleteByKey`: add `allowBotFields` opt-in routing per 3.2.
   `SetValueByKeyInput` additionally gains an optional `operation?: FieldOperationType` —
   consumed ONLY by the bot branch in v1 (contact branch ignores it, preserving today's
   set-only behavior byte-for-byte; the contact operation no-op is a pre-existing bug,
   separate PR). `applyValueOperation` accepts the temporal options
   (`sourceTimezoneOverride`, lenient parsing, fill-now) so date/datetime bot fields anchor
   to the step-frozen timezone.
2. Worker handler changes (explicit — NOT "unchanged"):
   - `handlers/contact.ts` — SET step handler: pass `allowBotFields: true`,
     `operation: step.operation`, and the existing timezone/temporal options through
     (variable resolution stays where it is). CLEAR step handler: pass
     `allowBotFields: true` ONLY — clear has no operation/temporal semantics; it routes to
     `clearValueByKey` and nulls the value.
   - `get-user-data.ts` (2 call sites): pass `allowBotFields: true` only.
   - Trigger `ActionExecutor` set/clear cases: dispatch via `parseFieldReference` — bot
     branch → `botFieldService.applyValueOperation` / `clearValueByKey`; custom branch
     keeps today's `setValues` / `deleteByCustomFieldId` calls unchanged.
   - Untouched (stay `allowBotFields` default-false, with negative tests): booking
     `submit-booking.action.ts:64`, `appointment-scheduling.ts:348,564`,
     `lead-ads/index.ts:78`, `rich-response/action-executor.ts:99,115`, and the
     workspace-token contact endpoints — the PUT/bulk setter (`workspace-token.ts:315`,
     via `setValues`) and DELETE (`workspace-token.ts:341`, via `deleteByKey`); GET stays
     in the negative suite as the read-only case.
3. Tests (`apps/worker/__tests__`, `packages/business/__tests__`): prefix routed to
   BotField (value updated, no `ContactCustomField` row created); SET path — operation +
   timezone forwarded end-to-end (builder save → trigger/flow execution); CLEAR path —
   routing only, asserts value nulled (no operation/temporal args); plain id/name
   unchanged; unknown bot-field id → existing notFound error (job-safe); clear sets null
   not delete; cache invalidation tags fire.

### Phase 5 — v2 (explicitly deferred, listed for completeness)
- Output-field slots of ~20 utility/AI steps (extract-data, speech-to-text, format-date,
  external-request, execute-js, get-data-from-json, generate-code, count-characters,
  ai-generate-*, AI Functions): each needs a read/validate adapter because they preflight
  `customFieldModel`/`contactCustomFieldModel` directly. Rollout = flip `includeBotFields`
  per step ONLY after its adapter lands.
- `{{bot_field.<name>}}` read interpolation in `contactVariableService`
  (`packages/variables/src/contact-variable.ts`): requires explicit namespace + precedence
  policy (name-keyed merge would be insertion-order dependent) + TipTap options update.
- Condition step / field-based triggers reading bot-field values.
- Fixing the pre-existing contact-field operation no-op bug (separate PR if user wants).

### Phase 6 — Quality gate
- `pnpm lint`, `pnpm --filter builder check-types`, `pnpm --filter worker check-types`,
  business/flow-config typechecks; `invariant-guard` pass; negative-surface test suite
  (3.5); round-trip export/import tests (3.4).

## 5. Test matrix (all cases)

| Area | Cases |
|---|---|
| field-reference | parse: numeric id, legacy NAME, `bot_field:<id>`, malformed (`bot_field:`, `bot_field:x`, empty); format; zod: legacy names still accepted, malformed reserved prefix rejected |
| botFieldService | list count fix; find by id/name; operation×type policy matrix (valid + every invalid combo errors); concurrent increase AND append/prepend (atomicity); non-numeric historical value under inc/dec fails predictably; clearValueByKey null-not-delete; **stale-read**: cached `find`/`findByKey` re-read fresh after update/clear (both id- and key-cache entries) |
| routing | setValueByKey/deleteByKey × {allowBotFields true/false} × {legacy key, bot token, unknown}; default-false: bot token → notFound, no BotField mutation; no ContactCustomField row and no customFieldChanged event for bot path |
| worker handlers | set/clear step + trigger set/clear + get-user-data with bot ref; variable tokens in value still resolved; legacy behavior byte-identical |
| public API (negative) | workspace-token contact GET/PUT/DELETE custom-field endpoints must NOT read or mutate bot fields with a `bot_field:` token |
| export/import/template | typed collector; round-trip remap (same ws, cross ws, old export without botFields key, missing manifest warning); scalar-before-generic ordering; snapshot flows-only + settings+flows + install ordering populate idMaps.botField |
| UI | AccountFieldsCard render/search/edit-value/delete; picker grouping; lazy store fetch + dedupe; folder move preserves id/value and flow tokens; negative: inbox + contact filter + import/export offer no bot fields |
| schemas | widened trigger/step schemas accept legacy names + bot tokens; contact-only schemas still reject `bot_field:*` |

## 6. Risks

- HIGH (mitigated): template/flow import remap of `bot_field:` tokens — full spec 3.4 + tests.
- MEDIUM: schema widening shared-object blast radius — audit every consumer of the widened
  zod objects before merging.
- MEDIUM: operation semantics on temporal/number values — registry handlers + error paths
  tested; unknown/invalid input surfaces the existing exception type (job retry-safe).
- LOW: two-table URL param collision — avoided by client-driven card (verified hook keys).
- LOW: i18n completeness across locales.

## 7. Estimated complexity: MEDIUM-HIGH (~1.5–2 days incl. tests)
