# Design: Timezone-aware `date` / `datetime` custom fields

- **Date:** 2026-07-22
- **Status:** Approved design — ready for implementation plan
- **Baseline branch:** `feat/custom-field-timezone`, branched from `feat/contact-filter-timezone` (Phase 1, commit `01e8a36d` — *not* on `main`)
- **Author context:** Phase 2 of the contact-filter timezone work. Phase 1 shipped timezone-correct filtering for **system date columns** only; this phase extends the same model to **custom fields** and to the **write / storage / display / migration** paths that Phase 1 deliberately left out.

> **Revision 2026-07-23 (supersedes the `date` → UTC rule below):** A `date` custom field now stores the user's calendar day **offset-preserved in the source zone** (`2026-07-22` in UTC+7 → `2026-07-22T00:00:00+07:00`), NOT as a UTC instant. `datetime` is unchanged (UTC instant). The `date` `eq`/`ne` filter accepts either `YYYY-MM-DD` (calendar-day compare, ignoring time and timezone) or `YYYY-MM-DD HH:mm` (exact-instant compare). Sections 2, 4.2, 4.3, 4.6 and the §5 data flow are corrected below to match.

---

## 1. Problem

`date` and `datetime` custom-field values are stored as **naive wall-clock strings** (`"2026-07-22"`, `"2026-07-22 15:30:00"`) with no timezone. That is ambiguous and produces wrong results:

- A contact whose field says `"2026-07-22"` means different absolute instants for a workspace in UTC+7 vs UTC−5.
- Filters compare these naive strings against `timestamptz` in the **Postgres session zone** (UTC), so "field equals 2026-07-22" silently uses UTC day boundaries regardless of the operator's actual timezone.
- The same field renders identically everywhere, with no notion of *whose* clock it represents.

## 2. Goal

Store every `date` / `datetime` custom-field value as an unambiguous ISO 8601 value, and interpret it against an explicit timezone at each boundary:

| Boundary | Timezone used | Rationale |
|----------|---------------|-----------|
| **UI write** (builder pickers) | Browser local (implicit) | User types wall-clock in their own zone |
| **Non-UI write** (webhook / worker / integration / API) | `contact.timezone ?? workspace.timezone` | No browser present; derive the author's zone |
| **Filter query** | Timezone captured from the filter UI at save time | "created on 2026-07-22" is a zone-relative question |
| **Variable render** (system-field variable substitution) | Workspace timezone | Messages speak in the workspace's voice |
| **UI display / read-back** | Browser local | Symmetric with UI write |
| **Legacy backfill** | Workspace timezone (assumption) | Best available guess for existing rows |

Storage rules:
- **`datetime`** → exact instant. `2026-07-22 15:30` entered in UTC+7 → `2026-07-22T08:30:00.000Z`.
- **`date`** → **offset-preserved start-of-day in the source zone** (ISO 8601 with the source offset). `2026-07-22` entered in UTC+7 → `2026-07-22T00:00:00+07:00`. The date part is the user's calendar day in every zone; the offset still pins a correct absolute instant for trigger/webhook precision.

### Non-goals

- No change to `number`, `text`, `boolean`, `select`, `multiSelect` custom fields.
- No change to the storage **column type** (`ContactCustomField.value` stays `TEXT`; we store an ISO string in it, cast to `timestamptz` only inside filter SQL — keeping the column index-friendly, exactly as Phase 1 does).
- No new user-facing UI for choosing a per-field timezone. Timezone is always *derived*, never asked.

---

## 3. Key discoveries that shape the design

These were verified against the code and correct earlier assumptions.

1. **`date` and `datetime` still share the filter value family, but `customFieldType` drives equality semantics.** `convertCustomFieldTypeToConditionType` maps both custom-field types to `formFieldTypes.enum.datetime`; `customFieldType` is persisted on saved custom-field conditions and reaches the predicate builder. `date` vs `datetime` diverges in write normalization, display formatting, and `eq`/`ne` predicate behavior.

2. **Phase 1 already built most reuse primitives.** `packages/database/src/queries/contact-filter/timezone.ts` exports `filterValueToUtcIso`, `filterValueToUtcDayStartIso`, `filterValueToUtcDayEndIso`, `resolveFilterTimezone`, `DEFAULT_FILTER_TIMEZONE`. `date` storage adds `toZonedDayStartIso`, but datetime and range comparisons continue to reuse the existing UTC-bound helpers.

3. **`setValues` is *not* the single write funnel** (this corrected an earlier wrong assumption). ~15 sites write `contactCustomFieldModel` directly, bypassing `setValues` — and therefore also bypassing its event emission (`emitCustomFieldChanged`) and cache invalidation. Consolidating them fixes those latent bugs *and* AGENTS.md invariant #9 (no direct `db` in the app layer).

4. **Variable rendering must be type-aware.** A stored `date` value now contains an offset ISO string and should render as its literal calendar day; a `datetime` remains a UTC instant and renders in the selected display timezone. The render context already holds both the field `type` and timezone context, so the fix is local. **This is required, not optional, and must ship with the migration.**

5. **Builder pickers must use different serialization by type.** The `date` picker writes a clean `yyyy-MM-dd` value (`saveFormat="formatted"`) so the shared write normalizer can anchor it offset-preserved in the source timezone. The `datetime` picker keeps `saveFormat="iso"` because it represents an exact instant. Read-back must feed the date picker `yyyy-MM-dd`, not the raw offset ISO.

6. **Timezone normalization must chain.** Contact/workspace timezone may be stored as an offset (`"+7"`, `"7"`, `"+07:00"`). Source zone for non-UI writes = `resolveFilterTimezone(normalizeStoredTimezone(contact.timezone ?? workspace.timezone))`. `normalizeStoredTimezone` (`packages/business/src/contact-locale`) maps offsets → IANA first; feeding a raw offset straight into `resolveFilterTimezone` would degrade it to UTC.

7. **The datetime guard regex already accepts canonical output.** `DATETIME_VALUE_PATTERN` matches millis + `Z`, so `toISOString()` values pass the predicate guard unchanged. No regex change needed.

---

## 4. Architecture

Six coordinated changes, all built on **one shared timezone engine**.

### 4.1 Shared timezone engine (promote Phase 1)

**Move** the pure functions from `packages/database/src/queries/contact-filter/timezone.ts` to a shared leaf so the write service, the filter predicate, and (optionally) variables all import one implementation.

- **Home:** `@chatbotx.io/utils` (already a dependency of both `@chatbotx.io/database` and `@chatbotx.io/business`; leaf package, no circular-dependency risk). Add `date-fns` + `date-fns-tz` to its deps.
- **Fallback if `utils` is undesirable:** a new `@chatbotx.io/datetime` package (remember AGENTS.md invariant #5: `CI=true pnpm install --no-frozen-lockfile` after creating it).
- `contact-filter/timezone.ts` becomes a thin re-export so Phase 1 import sites keep working (no churn in `predicates.ts` / `index.ts`).

Public surface (unchanged behavior, new home):

```ts
resolveFilterTimezone(tz: string | null | undefined): string
filterValueToUtcIso(value: string, timezone: string): string          // instant; pass-through if offset present
filterValueToUtcDayStartIso(value: string, timezone: string): string  // day start (UTC)
filterValueToUtcDayEndIso(value: string, timezone: string): string    // next day start (UTC), DST-safe
hasExplicitOffset(value: string): boolean                             // newly exported (write path needs it)
DEFAULT_FILTER_TIMEZONE: "UTC"
```

### 4.2 Write path — normalize inside `setValues`, and funnel every write through it

**A single storage normalizer**, keyed by field type, driven by an object map (no `if/else` sprawl):

```ts
// packages/business/src/contact-custom-field/normalize.ts
type StorageNormalizer = (value: string, resolveTz: () => string) => string

const identity: StorageNormalizer = (value) => value

const STORAGE_NORMALIZERS: Partial<Record<CustomFieldType, StorageNormalizer>> = {
  datetime: (value, resolveTz) => filterValueToUtcIso(value, resolveTz()),
  date: (value, resolveTz) => toZonedDayStartIso(value, resolveTz()),
}

export function normalizeCustomFieldValueForStorage(
  type: CustomFieldType,
  value: string,
  resolveTz: () => string,
): string {
  if (value === "") return value
  return (STORAGE_NORMALIZERS[type] ?? identity)(value, resolveTz)
}
```

- `resolveTz` is a **lazy** thunk: it is only invoked for *naive* date/datetime values. Values carrying `Z`/offset (all builder-picker writes) skip timezone resolution entirely — no extra DB query on the hot path.

**`setValues` changes** (`packages/business/src/contact-custom-field/service.ts`):
- Add `type: true` to the `customFieldModel.findMany` column selection.
- Add optional `sourceTimezone?: string` to `SetValuesInput`. Callers who already know the zone (e.g. a webhook handler holding the contact) pass it; otherwise resolve lazily inside the service via `resolveWriteTimezone(workspaceId, contactId, tx)` = `resolveFilterTimezone(normalizeStoredTimezone(contact.timezone ?? workspace.timezone))`, fetched only when a naive date/datetime value is actually present.
- Apply `normalizeCustomFieldValueForStorage(customField.type, field.value, resolveTz)` when building the value to persist. Change-detection compares the **normalized** value against the stored value (avoids rewriting equal instants and re-emitting events).

**Consolidate the ~15 bypass sites** (chosen strategy) to call `contactCustomFieldService.setValues(..., tx)` instead of inserting `contactCustomFieldModel` directly. Confirmed sites:

| Layer | File:line |
|-------|-----------|
| Builder | `features/contacts/actions/update-contact-field.action.ts:105` |
| Builder | `features/contacts/actions/add-contact-custom-field.action.ts:141,155,233,240` |
| Worker | `trigger/.../tool-handler.ts:76,135,202,307` |
| Worker | `trigger/.../action-executor.ts:137` |
| Worker | imports `handler.ts:249` |
| Integration | `whatsapp-flow-response.ts:176` |
| Integration | `handlers/contact.ts:51`, `utils/contact.ts:77` |
| Integration | `spreadsheet-handler.ts:407` |

`setValues` already accepts `tx: DatabaseClient = db` and opens a nested transaction (SAVEPOINT), so callers inside an existing transaction can adopt it without restructuring. Each migrated site is verified to still run inside its original transaction and to preserve `contactInbox`/batching semantics.

### 4.3 Filter predicate — thread timezone into the custom-field datetime path

The one-line gap: `index.ts:463-464` `case "customField": return buildCustomFieldWhere(condition)` drops `timezone`.

- Thread it: `buildCustomFieldWhere(condition, timezone)` → `buildCustomFieldComparison(..., timezone)` → `buildDatetimeCustomFieldPredicate(operator, value, intervalValue, timezone)`.
- Rewrite `buildDatetimeCustomFieldPredicate` to keep `datetime` semantics and add a `date` equality branch driven by `customFieldType`:
  - `eq` (and `ne` via negation): **driven by `customFieldType`.**
    - `customFieldType === "date"` **and no time typed** → `left(column,10) = <datePart>` (text prefix; ignores time and timezone; NO `::timestamptz` cast).
    - `customFieldType === "date"` **and a time was typed** → `ts = filterValueToUtcIso(value, tz)::timestamptz` (exact instant).
    - otherwise (`datetime`/legacy/undefined) → the day-range `ts >= dayStart AND ts < dayEnd` (unchanged).
  - `gt/gte/lt/lte` → exact instant (unchanged). `isBetween` → instant bounds (unchanged).
- Guard (`DATETIME_VALUE_PATTERN`) and three-valued NULL negation semantics are unchanged.

`getCustomFieldIntervalValue` and the number/text branches are untouched.

### 4.4 Filter timezone persistence across all five surfaces

The filter must carry the UI's timezone so the predicate can reconstruct day boundaries. Phase 1 already added `timezone` to `conditionCaseSchema` (flow conditions), to `ContactFilterCriteriaInput.timezone`, and captures the browser zone client-side (`getBrowserTimezone()`).

Phase 2 audits and closes the persistence gap on each surface so the stored filter definition includes the browser timezone at save time and passes it into `applyContactFilter` at evaluation time:

| Surface | Where the filter is built/evaluated | Action |
|---------|-------------------------------------|--------|
| Contact filter (audience) | `apps/builder/src/features/contact-filter/*` | Confirm browser tz is stamped into the persisted criteria and forwarded on evaluate |
| Broadcast | broadcast audience-filter build/consume | Stamp + forward |
| Inbox | inbox contact-filter build/consume | Stamp + forward |
| Trigger | reuses `conditionCaseSchema` (already has `timezone`) | Confirm capture + evaluation wiring |
| Webhook | webhook-driven filter evaluation | Forward stored tz (webhooks have no browser → fall back to workspace tz at *evaluation* if absent) |

Contract: `resolveFilterTimezone` already defaults missing/invalid zones to UTC, so an un-stamped legacy filter degrades safely rather than throwing.

### 4.5 Variable rendering — workspace timezone

`packages/variables/src/contact-variable.ts`: in the custom-field branch, format by type using the existing helpers in `packages/variables/src/utils.ts` (`formatDate` / `formatDateTime(value, timezone)`, `DATE_PATTERN`, `DATE_TIME_PATTERN`):

```ts
const entry = customFieldsMap.get(variable)
mapping[variable] = renderCustomFieldValue(entry, workspace?.timezone) // date/datetime → workspace tz; else raw
```

`renderCustomFieldValue` uses the same object-map-by-type shape as the storage normalizer (symmetry, no `if/else` ladder). Workspace tz is normalized via `normalizeStoredTimezone` before formatting.

### 4.6 UI display / write

- `apps/builder/src/features/contacts/components/add-custom-field-dialog.tsx`: the `date` picker writes a **naive `yyyy-MM-dd`** (`saveFormat="formatted"`); the `datetime` picker writes a UTC ISO instant (`saveFormat="iso"`). Both resolve their `saveFormat` from `resolveTemporalCustomFieldSaveFormat(type)` (single source). The write-time normalizer turns the naive date into the offset-preserved value using the source zone.
- The filter UI adds a dedicated `date` equality input with a `YYYY-MM-DD` placeholder that accepts an optional ` HH:mm`.
- Verify read-back feeds the date picker a clean `yyyy-MM-dd` form value and the datetime picker its raw ISO instant.
- Audit any other builder surface that displays a raw custom-field date/datetime string and route it through a browser-zone formatter.

### 4.7 Worker trigger correctness

`apps/worker/src/trigger/utils/datetime-calculator.ts` and the date-time trigger evaluator parse offset ISO values as the correct absolute instant. `datetime` stores UTC ISO; `date` stores offset-preserved start-of-day. No logic change is required here beyond keeping comments/tests aligned with the storage contract.

### 4.8 Legacy backfill migration (SQL)

Generate a Drizzle migration (`make:migration`) that rewrites existing `date`/`datetime` custom-field values from naive wall-clock (assumed workspace timezone) to the new canonical storage formats.

- Join `ContactCustomField` → `CustomField` (type in {`date`,`datetime`}) → owning `Workspace` (timezone; normalize offset formats to IANA in-SQL or via a mapping CTE, matching the JS normalizer).
- `datetime`: `(value AT TIME ZONE ws_tz) AT TIME ZONE 'UTC'` → UTC ISO. `date`: keep `left(value,10)` as the calendar day and append the workspace zone offset for that day (`YYYY-MM-DDT00:00:00±HH:MM`).
- Idempotent: skip rows that already carry `Z`/offset (regex guard), so re-runs and post-deploy writes are safe. Precedent: `20260712023830_backfill_contact_timezone` (CTE + regex).
- **Parity requirement:** one shared fixture set asserts the SQL migration and the JS write normalizer produce byte-identical output for the same (naive value, workspace tz), including offset-format zones and a DST-crossing date.
- **Migration safety (AGENTS.md):** generate and inspect the SQL only; **do not** run `db:migrate` — wait for explicit user approval.

---

## 5. Data flow

```
WRITE (UI, browser UTC+7)  picker(saveFormat="formatted") -> "2026-07-22" -> setValues(date) -> toZonedDayStartIso -> "2026-07-22T00:00:00+07:00"
FILTER (audience "date = 2026-07-22", no time)  -> left(value,10) = '2026-07-22'  (calendar-day match, zone-independent)
FILTER (audience "date = 2026-07-22 09:30")      -> ts = 2026-07-22T02:30Z::timestamptz  (exact instant)
DISPLAY / variable  "2026-07-22T00:00:00+07:00" -> datePartOf -> "2026-07-22"  (calendar day, zone-independent)
```

---

## 6. Edge cases

- **Empty value** → stored/rendered as-is (no normalization, no formatting).
- **Value already carrying `Z`/offset** on a `datetime` write → treated as an absolute instant. For a `date` write, only the calendar date part is used and re-anchored offset-preserved in the source timezone.
- **Invalid / unknown timezone** (contact, workspace, or filter) → `resolveFilterTimezone` falls back to UTC; never throws at query-build or write time.
- **Offset-format stored zone** (`"+7"`) → `normalizeStoredTimezone` → IANA before use.
- **DST boundary** for date ranges and exact-instant comparisons → `filterValueToUtcDayEndIso` computes the *next calendar day* (not `+24h`), so ranges stay correct across transitions; `date` day-only equality uses the stored date prefix and is zone-independent.
- **`date` field authored in a zone different from the filter zone** → day-only equality is unaffected because it compares the stored calendar date prefix. Exact-instant operators still use the authored offset and filter timezone as absolute-time semantics require.
- **Legacy filter without a stored timezone** → evaluates in UTC (safe default), matching pre-Phase-2 behavior until re-saved.

---

## 7. Testing strategy

Per project rules (80%+, unit + integration, all cases). Shared fixtures drive multiple layers so write, filter, and migration cannot drift.

- **Shared tz engine (unit):** datetime naive→UTC instant; date naive→offset-preserved day-start; day-end DST-safe; offset handling; invalid-tz fallback.
- **Storage normalizer (unit):** date vs datetime vs non-temporal; empty; date offset-preserved storage; datetime offset normalization; source timezone fallback chain.
- **`setValues` (integration):** normalizes by type; change-detection on normalized value; events + cache invalidation fire; `tx` participation; `sourceTimezone` override vs lazy resolution; fallback chain contact→workspace.
- **Bypass-site migration (integration):** each consolidated site persists normalized temporal values and now emits events / invalidates cache.
- **Filter predicate (integration, real SQL):** date `eq` day-prefix compare, date `eq` with time exact instant, datetime `eq` day-range, gt/gte/lt/lte instant, between, negation/NULL, across UTC+7 vs UTC−5 filter zones.
- **Variable render (unit):** date → literal stored calendar day; datetime → display timezone; non-temporal untouched; missing timezone → safe default.
- **Trigger calculator (unit):** day-of / before / after in explicit zone against UTC/offset ISO stored values.
- **Migration parity (integration):** SQL result == JS normalizer result for a fixture matrix (IANA + offset zones, a DST-crossing date, a datetime); idempotency (second run is a no-op).

---

## 8. Risks & rollout

- **Deployment atomicity (highest risk):** picker `saveFormat`, non-UI write normalization, predicate tz-awareness, variable/display formatting, and the backfill migration are mutually dependent. They ship as **one release**. Ordering within the release: (1) code deploy that writes+reads the new temporal formats and evaluates filters with tz/type; (2) backfill migration (after approval). Between these, un-backfilled legacy naive rows are degraded, not broken; the migration closes the gap.
- **Scope of write consolidation:** ~15 sites across builder/worker/integration. Mitigated by `setValues` already supporting `tx`; each site migrated and tested individually.
- **High request volume:** normalizer is pure and allocation-light; timezone resolution is lazy and skipped for the common (offset-carrying) case; predicate keeps `timestamptz` comparisons index-friendly (no per-row `date_trunc`/`AT TIME ZONE`).
- **SQL/JS parity:** enforced by the shared fixture matrix; a divergence is a failing test, not a production surprise.

---

## 9. Open questions

All resolved during design:
- Write strategy → **consolidate into `setValues`** (fixes bypass + invariant #9 + latent event/cache bugs).
- `date` vs `datetime` predicate → **unified** (both are `datetime` at filter time; divergence only at write time).
- Shared engine home → **`@chatbotx.io/utils`** (fallback: new `@chatbotx.io/datetime`).
- Migration → **SQL backfill**, workspace-tz assumption, idempotent, parity-tested.

---

## 10. File inventory (impacted)

**Shared engine:** `packages/utils/*` (new tz module + deps), `packages/database/src/queries/contact-filter/timezone.ts` (→ re-export).
**Write:** `packages/business/src/contact-custom-field/service.ts`, new `.../normalize.ts`; the ~15 bypass sites in §4.2.
**Filter:** `packages/database/src/queries/contact-filter/index.ts` (thread tz), `.../custom-field-predicates.ts` (rewrite datetime predicate).
**Filter surfaces:** contact-filter / broadcast / inbox / trigger / webhook build+evaluate points (§4.4).
**Render:** `packages/variables/src/contact-variable.ts`, `packages/variables/src/utils.ts` (reuse).
**UI:** `apps/builder/src/features/contacts/components/add-custom-field-dialog.tsx` (+ any other raw date display).
**Worker:** `apps/worker/src/trigger/utils/datetime-calculator.ts` (+ downstream).
**Migration:** new Drizzle migration under `packages/database`.
