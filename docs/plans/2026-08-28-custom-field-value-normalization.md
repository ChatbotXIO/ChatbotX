# Custom/Bot field value normalization — store canonical, filter correct

Status: DRAFT — awaiting user confirmation.

## Problem (verified)

- `normalizeCustomFieldValueForStorage` (`packages/business/src/contact-custom-field/normalize.ts`)
  normalizes ONLY `date`/`datetime`. `number`/`boolean`/text pass through raw — any write
  path that is not a typed UI input (flow Set Custom Field free-text value with
  `{{variables}}`, trigger actions, AI extract/tools, public APIs, imports, JS execution)
  can store garbage: real examples `number = "1aaa1"`, `boolean = "12313"`.
- Contact filter (`packages/database/src/queries/contact-filter/custom-field-predicates.ts`):
  `number` and `datetime` are guarded + cast (garbage rows silently never match), but
  `boolean` has NO branch — it falls into plain TEXT equality, so stored `"TRUE"`, `"1"`,
  `"0"` never match the UI's `eq "true"/"false"` condition.
- Bot fields reuse the same normalize util → same gap (screenshot evidence). Bot fields do
  NOT participate in contact filter — their fix is storage-side + display only.

## Design principle

One canonical form per `CustomFieldType`, enforced at the WRITE chokepoints of BOTH
systems (single registry, no per-caller logic), plus a defensive read-side boolean
predicate so legacy rows filter correctly without waiting for backfill.

### Canonical storage forms

| Type | Canonical stored value | Coercion on write |
|---|---|---|
| boolean | `"true"` / `"false"` | trim+lowercase; sets follow **Postgres boolean literal semantics** (Chatwoot casts `::boolean` in SQL, which accepts exactly these): TRUTHY `{t, true, y, yes, on, 1}`, FALSY `{f, false, n, no, off, 0}`; `""` → `"false"` (per user: `0/false/rỗng/FALSE → false`); unrecognized non-empty → `"true"` (never throws — chatbot flows must not crash on user text; Chatwoot would raise a cast error here, we deliberately don't) |
| number | canonical decimal string via `Number()` (`"007"`→`"7"`, `" 1.50 "`→`"1.5"`) | trim; `""` stays `""` (unset); non-parseable (NaN/∞) → throw typed `ChatbotXException` (predictable, no silent data loss) — same failure surface as temporal Strict today |
| date / datetime | (already done) ISO via existing temporal normalization | unchanged |
| shortText / longText | trimmed as-is | unchanged (zod already trims) |
| email / phoneNumber | trimmed; email additionally lowercased? — **user decision** (default: trim only, no behavior change) |

Implementation: extend `normalizeCustomFieldValueForStorage` with a
`Record<CustomFieldType, Normalizer>` registry (async only for temporal; others pure).
Single source of truth; exported pure helpers (`normalizeBooleanValue`,
`normalizeNumberValue`) unit-testable without DB.

## Phases

### Phase 1 — ONE unified normalizer registry (Codex r1: a second normalizer already exists)
- **Discovery**: `packages/business/src/javascript-execution/custom-field-value.ts` already
  normalizes/validates per type (strict boolean `true/false/1/0`, own number regex, email
  lowercase) and is used by CONTACT IMPORT. Two independent normalizers must not drift.
- Unify: shared literal sets + pure per-type normalizers live in
  `@chatbotx.io/utils/custom-field` (NEXT TO the `CustomFieldType` enum — utils is the
  dependency floor: flow-config and database cannot import business). Two POLICY modes:
  - `coerce` (runtime writes: flows, triggers, APIs, dialogs) — table above, never throws
    on boolean, throws typed error on bad number.
  - `strict` (import) — invalid → skip the field (import's existing behavior), but the
    ACCEPTED literal sets are the same shared constants (import's boolean set widens from
    `true/false/1/0` to the full PG-literal set — deliberate, documented change).
- `normalize.ts` (business) and `custom-field-value.ts` both delegate to the shared
  registry; neither keeps a private copy.
- Unit tests: full matrix per type × mode (booleans: `0/1/true/TRUE/False/yes/no/on/off/
  ""/"12313"/"  TRUE  "`; numbers: `"7"/"007"/" 1.5 "/"1e3"/""/"1aaa1"/"-2.5"/Infinity`;
  text passthrough).

### Phase 2 — Enforce at EVERY write path (audited list, not an assumption)
Contact fields (`ContactCustomField.value`):
1. `contactCustomFieldService.setValues` / `setValuesInTransaction` core — covers the
   20+ service callers incl. `setValueByKey` (verified: it funnels into `setValues`; one
   normalization point, idempotent).
2. `insertNormalizedValuesForNewContacts` (bulk import fast-path that bypasses
   `writeValues`) — switch to the shared registry in `strict` mode.
3. `apps/worker/src/integration/handlers/ref.ts` — writes `contactCustomFieldModel`
   DIRECTLY (also a data-access-rule violation): refactor to go through the service
   (normalization then applies automatically).
Bot fields (`BotField.value`):
4. One private `prepareValuePatch(type, value)` inside `botFieldService`, called by
   `create`, `updateByKey` (covers builder dialogs AND the workspace-token set-one/set-many
   APIs which call `updateByKey` directly), and `bulkUpdateByKeys` (make it delegate to the
   same primitive instead of its own write). `applyValueOperation` set path already calls
   the normalizer — switches to the shared registry.
5. Template install `settings.ts` bot-field `create` with `value` → covered by (4).
   (`resolveByNameAndType` creates definitions only, no value — verified, nothing to do.)
- Operations: `increase`/`decrease` operand goes through the shared number normalizer
  BEFORE the atomic SQL (typed error instead of a PG cast error); `append`/`prepend`
  text-only (unchanged).
- Regression guarantee: temporal behavior byte-identical; **text types stay RAW —
  no trim** (trimming at storage would change flow/tool/API behavior for callers that
  bypass zod; explicitly out of scope).

### Phase 3 — Filter correctness (read side, defensive for legacy rows)
- `custom-field-predicates.ts`: add a dedicated `boolean` branch mirroring the file's OWN
  existing number pattern (guard + `NULLIF(...)::cast`), whitespace-tolerant for legacy
  rows: guard on `lower(btrim(value)) ~ '^(t|true|y|yes|on|1|f|false|n|no|off|0)$'` then
  compare `NULLIF(lower(btrim(value)),'')::boolean = <param>` (so legacy `" TRUE "`
  matches). Chatwoot casts `::boolean` unguarded and ERRORS on garbage; we keep the repo's
  guarded philosophy so garbage rows silently don't match. The regex source derives from
  the shared literal arrays in `@chatbotx.io/utils/custom-field` (same source as the JS
  normalizers) so write & read can never drift. UI already sends exactly `"true"/"false"`
  (verified: contact-filter-condition-dialog.tsx:234). `isEmpty`/`isNotEmpty` unchanged
  (they treat only `''` as empty — preserved).
- Number/datetime branches already guarded — no change; add regression tests pinning the
  guard behavior for garbage values.
- Tests in `packages/database/__tests__/contact-filter.test.ts` style: legacy variants
  (`"TRUE"`, `"1"`, `"0"`, `"FALSE"`, `""`, garbage `"12313"`) × eq true/false.

### Phase 4 — Display polish (Account Fields card + contact panel)
- Value column: boolean shows localized True/False label; date/datetime formatted for
  display (workspace zone) instead of raw ISO. Display-only — stored value untouched.

### Phase 5 — Legacy data backfill (one-off script, index-aware)
- `scripts/normalize-field-values.mts`: dry-run by default, `--fix` applies the shared
  registry normalizers (boolean coercion; number: non-parseable left untouched + reported
  — never destroys data).
- Query strategy (`ContactCustomField` has NO `workspaceId`; indexes are unique
  `(contactId, customFieldId)` and `(customFieldId, id)`): enumerate boolean/number
  `CustomField` definitions first, then **keyset-paginate `ContactCustomField` on
  `(customFieldId, id)`** — never offset-scan or full-table update. `BotField` is small;
  scan per workspace.
- Cache: no per-contact invalidation from a bulk script — do an explicit Redis
  prefix purge of the contact-custom-field cache tags after `--fix` (or document
  accepting the TTL window); state which in the script header.

### Phase 6 — Quality gate
- `pnpm lint`, check-types (database, business, builder, worker), full test suites,
  Fable + Codex review rounds per the established workflow.

## Decision points (need user answer)
1. **Boolean coercion**: generous (recommended — falsy set else true, never throws) vs
   strict allowlist (reject `"12313"`)?
2. **Number invalid input**: throw typed error (recommended) vs store `""` silently?
3. **Email lowercase on write**: yes/no (default no — avoids changing existing data
   semantics)?
4. Run Phase 5 `--fix` on production after review, or report-only first?

## Observable-behavior changes (read paths — regression tests required)
Canonicalization changes what downstream READERS see, not just storage:
- JS execution coerces boolean via `value === "true"`
  (`packages/variables/src/javascript-interpolation.ts:392`) — legacy `"TRUE"/"1"/"yes"`
  flip from false→true after normalization (this is the BUG FIX, but pin it with tests).
- `{{field}}` / `{{raw:field}}` interpolation, webhook payloads, tool params, CSV export,
  spreadsheet write, integration field-maps will emit canonical `"true"/"false"` —
  regression tests for each in the matrix.

## Risks
- MEDIUM: import boolean set widens from `true/false/1/0` to full PG literals — rows that
  previously skipped the field now import a value; documented, tested.
- MEDIUM: boolean semantics change for flows comparing raw text (see observable list) —
  changelog note.
- LOW: double-normalization — single point per system + idempotent normalizers (tested).
- LOW: JS/SQL literal-set drift — one shared constant in `@chatbotx.io/utils/custom-field`
  + a test asserting the SQL guard regex and JS sets agree on the full matrix.

## Estimated complexity: MEDIUM (~0.5–1 day incl. tests)
