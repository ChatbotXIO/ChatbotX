# Sequence step delay — unit change not persisted after reload

Status: IMPLEMENTED on branch fix/sequence-step-delay-unit-persistence (5 commits, reviewed by Claude + Codex, browser-verified).

## Reported bug

Sequence editor (`apps/builder/src/features/sequences/`). A step shows "After 2 Hours".
User switches the unit select Hours → Minutes WITHOUT editing the number. After F5 the
UI shows "2 Hours" again.

## Root cause (verified by Claude + Codex independent review)

Stored columns: `delayDays`, `delayMinutes` (scheduler source of truth, additive) and
`delayUnit` (display only, plus the `specificTime` discriminator). The UI has two places
that "guess" instead of trusting stored data, and they disagree:

1. `sequence-step-card.tsx:80-81` passes `currentDelayValue = step.delayDays || step.delayMinutes || 1`
   to `useSequenceStep` — the RAW stored minutes (120), not the displayed value (2).
   `use-delay-state.ts` `handleDelayUnitChange` calls `onSave({ delayUnit })` with no value,
   so `use-sequence-step.ts:142` falls back to 120 → saves `delayMinutes=120, delayUnit="minutes"`.
2. `use-delay-state.ts` `getInitialDelayUnit/getInitialDelayValue` ignore stored `delayUnit`
   for minutes/hours/days and infer from magnitude (`delayMinutes >= 60` → hours). On reload,
   120 minutes displays as "2 Hours" regardless of stored unit. 90 minutes displays as
   "1 Hours" (`Math.floor`, lossy). `immediate`/`specificTime` DO honor the stored unit.

Combined: the save is wrong (bug 1) and even a correct save would display wrong (bug 2).

## All defects found in this flow

| # | File | Defect | Impact |
|---|------|--------|--------|
| 1 | `components/sequence-step-card.tsx:80-81` | Raw stored value used as "current" display value | Unit-only change double-converts. Hours→Days writes `delayDays=120` → **real scheduling corruption** (scheduler = `delayDays*1440 + delayMinutes`) |
| 2 | `hooks/use-delay-state.ts:25-49` | Unit/value inferred from magnitude, stored `delayUnit` ignored | 120 min stored as minutes shows "2 Hours"; 90 min shows "1 Hours" |
| 3 | `hooks/use-sequence-step.ts:94` | `isSavingRef` guard silently DROPS a second save while one is in flight (no toast) | Focused number input → mousedown on Select → blur save #1 → unit pick save #2 dropped. Same guard affects `useTimeRangeState` (send-window controls, which are not even passed `isSaving`) |
| 4 | `components/delay-selector.tsx:50` | `localValue = useState(delayValue)` never re-syncs | Stale number after parent updates |
| 5 | `hooks/use-delay-state.ts:110` + `use-sequence-step.ts:98` | Editing an already-chosen specific date sends only `{ specificDateTime }`; "must be in the future" validation requires `delayUnit === "specificTime"` in the same payload | Validation runs only on first pick, bypassed on edit |
| 6 | `hooks/use-sequence-step.ts:138`, `schema/action.ts` | Leaving `specificTime` never clears `specificDateTime`; schema `z.iso.datetime().optional()` cannot accept `null` | Stale date reused on a later switch back. Scheduler safe (checks `delayUnit === "specificTime"`) |
| 7 | `schema/action.ts:63` | No cross-field validation: `delayUnit="days"` + `delayMinutes=120` accepted | Allows contradictory rows (how this bug persisted data) |
| 8 | `hooks/use-delay-state.ts:74` | Hook state initialized once; not reset after `router.refresh()` | If a save fails, UI keeps new value while DB has old |

Out of scope (file separate issues):

- `apps/worker/src/integration/handlers/contact.ts:399-410` — flow "subscribe to sequence"
  path computes first-step `nextRunAt` from `delayDays/delayMinutes` only, ignoring a
  first step configured as `specificTime`.
- `sequence-editor.tsx:148` never passes `previousStepTime`, so cross-step ordering
  validation in `handleSave` is dead code.
- `sequence-editor.tsx` `steps` prop type omits `delayUnit`, `specificDateTime`, `isActive`,
  send-window fields; runtime values arrive from `getSequence`. Type-only gap.

## Backward-compat audit (why this will not break existing flows)

| Surface | Consumers | Impact |
|---------|-----------|--------|
| `upsertSequenceStepRequest` / `upsertSequenceStepAction` | Only `sequence-editor.tsx` (Add button), `use-sequence-step.ts`, and `__tests__/upsert-sequence-step.action.test.ts` | No public API / SDK / MCP / CLI consumer. Cross-field validation cannot affect external clients |
| `useSequenceStep`, `useDelayState`, `DelaySelector` | Only `sequence-step-card.tsx` | Removing `currentDelayUnit/currentDelayValue` props is safe |
| Flow "Wait" step `DelayUnit` (`features/flows/.../wait/`) | Own type, own component | Untouched |
| `packages/sequence-scheduler`, `packages/business/contact-sequence`, worker | Read `delayDays + delayMinutes`; read `delayUnit` only for `=== "specificTime"` | No change. Writing `specificDateTime = null` for relative units is invisible to them |
| DB `delayUnit` column | Nullable since initial migration, no backfill; action always sets it on create | Null rows only possible from seed/external writers; display fallback handles them |
| Dev DB (scanned read-only) | 7 rows: minutes×5, immediate×1, days×1; zero inconsistent, zero null | No surprise display changes locally. The row the user already changed is stored as 120 minutes and will correctly show "120 Minutes" |
| Existing action tests | Mock the whole safe-action chain; schema is not exercised; update tests send single delay fields (e.g. only `delayDays: 3`) | Will not break, PROVIDED the new cross-field refine only runs when `delayUnit`, `delayDays`, `delayMinutes` are ALL present |

Three guard rails adopted from the audit:

1. Schema cross-field validation triggers only when the full delay triple is present.
   Partial payloads (legacy shape) still pass. The Add button already sends `days/1/0`.
2. `handleSave`'s public signature is unchanged so `useTimeRangeState`, `handleSelectFlow`,
   `handleActiveChange` need no edits.
3. Controls stay `disabled` while saving exactly as today. The queue only guarantees the
   second action is not lost; no visible UX change.

## Design

### Pure helpers — `apps/builder/src/features/sequences/lib/delay.ts`

```ts
type DelayUnit = "immediate" | "minutes" | "hours" | "days" | "specificTime"
type DelayView = { unit: DelayUnit; value: number; specificDateTime: string }
type StoredDelay = { delayDays: number; delayMinutes: number; delayUnit: DelayUnit; specificDateTime: string | null }

stepToDelayView(step): DelayView
delayViewToStored(unit, value, specificDateTimeIso?): StoredDelay
```

`stepToDelayView` rules — trust the stored unit ONLY when the numeric columns satisfy it
exactly; otherwise (or when `delayUnit` is null) fall back to the most precise unit:

| Stored unit | Accepted iff | Fallback |
|---|---|---|
| `specificTime` | `specificDateTime` non-null | inference below |
| `immediate` | days = 0 and minutes = 0 | inference |
| `days` | minutes = 0 (days ≥ 0) | inference |
| `hours` | days = 0 and minutes % 60 = 0 | inference |
| `minutes` | days = 0 | inference |
| null / other | — | inference |

Inference: days > 0 && minutes = 0 → days; days > 0 && minutes > 0 → minutes (days*1440+minutes);
minutes % 60 = 0 && minutes > 0 → hours; minutes > 0 → minutes; both 0 → immediate.
Never truncate (90 minutes is "90 Minutes", never "1 Hours").

`delayViewToStored`: days → `{value,0}`; hours → `{0,value*60}`; minutes → `{0,value}`;
immediate → `{0,0}`; specificTime → `{0,0, specificDateTime: iso}`. Every relative/immediate
result carries `specificDateTime: null`.

### Save flow

- `use-delay-state.ts`: unit change and value change BOTH send `{ delayUnit, delayValue }`
  from the currently displayed state. Specific-date edits always send
  `{ delayUnit: "specificTime", specificDateTime }` so validation runs every time.
- `use-sequence-step.ts`: drop `currentDelayUnit/currentDelayValue` props. Build the delay
  part of the payload with `delayViewToStored`. Replace the `isSavingRef` early-return with
  a FIFO promise chain (`queueRef = queueRef.then(run)`); each queued item's payload is
  fully computed at enqueue time (no stale closure). `isSaving` stays true until the chain
  drains; `router.refresh()` once after drain. `handleStepUpdateImpact` still runs per
  save (unchanged server behavior).
- `schema/action.ts`: `specificDateTime: z.iso.datetime().nullable().optional()`; add
  `superRefine` cross-field check guarded on all three delay fields being present.
  `buildUpdateData`/`buildCreateData` already map `null` correctly.
- `sequence-step-card.tsx`: delete the two raw-value lines.

### UI

- `delay-selector.tsx`: re-sync `localValue` when `delayValue` prop changes (effect keyed on
  prop). Import `DelayUnit` from the hook instead of redeclaring.
- `use-delay-state.ts`: reset view when `step.id` or the stored delay triple changes
  (server refresh), without overwriting an in-progress edit.
- Pass `isSaving` to `TimeRangeSelector` for consistency.

## Phases

1. **Helpers + tests first (TDD).** Create `lib/delay.ts` and
   `apps/builder/__tests__/sequence-delay.test.ts`: round-trip every unit; 120 min stored
   as minutes; 90 min stored as hours (→ 90 Minutes); hours→days conversion; null unit;
   contradictory rows; immediate; specificTime with/without date.
2. **Save flow.** `use-delay-state.ts`, `use-sequence-step.ts`, `schema/action.ts`,
   `sequence-step-card.tsx` per Design.
3. **UI sync.** `delay-selector.tsx`, `useDelayState` reset, `TimeRangeSelector` `isSaving`.
4. **Verify.** `pnpm --filter builder test -- sequence`, `pnpm lint`,
   `pnpm --filter builder check-types`. Browser reproduction of 4 scenarios:
   2 Hours → Minutes → F5 shows "2 Minutes"; Hours → Days → F5 shows days not 120 days;
   90 Minutes → F5 shows "90 Minutes"; Specific time → Days → F5 shows no stale date.

## Files touched

- `apps/builder/src/features/sequences/lib/delay.ts` (new)
- `apps/builder/__tests__/sequence-delay.test.ts` (new)
- `apps/builder/src/features/sequences/hooks/use-delay-state.ts`
- `apps/builder/src/features/sequences/hooks/use-sequence-step.ts`
- `apps/builder/src/features/sequences/schema/action.ts`
- `apps/builder/src/features/sequences/components/sequence-step-card.tsx`
- `apps/builder/src/features/sequences/components/delay-selector.tsx`

No DB migration. No worker/scheduler change.

## Risks

- MEDIUM: rows previously saved wrong (e.g. 120 min + unit minutes) will now display the
  truthful "120 Minutes" instead of "2 Hours". Correct per DB; users may notice.
- LOW: FIFO queue replays every rapid edit, each triggering `handleStepUpdateImpact`.
  Same per-save cost as today; only the previously-dropped saves are added.
- LOW: cross-field refine rejects contradictory payloads with a generic toast. Only the
  builder UI sends this payload and it will always be consistent after the fix.

Complexity: MEDIUM.

## Global Constraints (binding for every task)

- No `any`. No hardcoded user-facing strings (use `useTranslations()`; keys `sequences.delayUnits.*`, `sequences.afterText`, `sequences.timeValidation`, `messages.unknownError` already exist in `apps/builder/messages/en.json`).
- Business rules expressed as lookup tables (`Record<DelayUnit, ...>` / ordered arrays), not if-else chains.
- Reuse existing handlers; do not add parallel helpers that duplicate `handleSave`, `buildUpdateData`, etc.
- `handleSave`'s call sites in `useTimeRangeState`, `handleSelectFlow`, `handleActiveChange` must keep working without edits to their payload shape (`flowId`, `isActive`, `anytime`, `sendTimeStart`, `sendTimeEnd`, `sendDays`).
- Schema cross-field validation must only run when `delayUnit`, `delayDays` and `delayMinutes` are ALL present in the payload.
- Scheduler, worker, `packages/*` are NOT touched. No DB migration.
- Tests live in `apps/builder/__tests__/` (vitest, `describe/test/expect` style, see `update-smart-response-delay-schema.test.ts`). Run with `pnpm --filter builder test -- <pattern>`.
- Before reporting done: `pnpm fix` on touched files is allowed; `pnpm --filter builder check-types` and `pnpm lint` must pass.
- Commit per task with `<type>(<scope>): <subject>` (lowercase after colon, ≤100 chars). Stage specific files only, never `git add -A`. Never `--no-verify`.
- Do not use `git add -A` / `git add .`. Do not touch files outside the list in each task.

## Task 1: Pure delay helpers + unit tests

Files: create `apps/builder/src/features/sequences/lib/delay.ts`, create `apps/builder/__tests__/sequence-delay.test.ts`.

Write the tests first, watch them fail, then implement.

### Exports of `lib/delay.ts`

```ts
export const DELAY_UNITS = ["immediate", "minutes", "hours", "days", "specificTime"] as const
export type DelayUnit = (typeof DELAY_UNITS)[number]

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
export const MIN_DELAY_VALUE = 1
export const MAX_DELAY_VALUE = 99_999

export type StoredDelayFields = {
  delayDays: number
  delayMinutes: number
  delayUnit?: string | null
  specificDateTime?: Date | null
}

export type DelayView = {
  unit: DelayUnit
  value: number              // display number; 1 for immediate/specificTime
  specificDateTime: string   // datetime-local input value ("YYYY-MM-DDTHH:mm") or ""
}

export type StoredDelay = {
  delayDays: number
  delayMinutes: number
  delayUnit: DelayUnit
  specificDateTime: string | null   // ISO string for specificTime, null otherwise
}

export function isDelayUnit(value: unknown): value is DelayUnit
export function isDelayValueInRange(value: number): boolean   // integer, MIN..MAX inclusive
export function isStoredDelayConsistent(fields: { delayDays: number; delayMinutes: number; delayUnit: DelayUnit }): boolean
export function stepToDelayView(step: StoredDelayFields | undefined): DelayView
export function delayViewToStored(view: { unit: DelayUnit; value: number; specificDateTimeIso?: string | null }): StoredDelay
export function toLocalDateTimeInputValue(date: Date): string   // "YYYY-MM-DDTHH:mm" in browser local time
export function oneHourFromNowLocal(): string                    // toLocalDateTimeInputValue(now + 1h)
```

### Rules

`isStoredDelayConsistent` — one predicate per unit in a `Record<DelayUnit, (f) => boolean>`:

| unit | consistent iff |
|---|---|
| immediate | days = 0 and minutes = 0 |
| minutes | days = 0 (minutes ≥ 0) |
| hours | days = 0 and minutes % 60 = 0 |
| days | minutes = 0 |
| specificTime | days = 0 and minutes = 0 |

`stepToDelayView(step)`:
- `undefined` step → `{ unit: "days", value: 1, specificDateTime: "" }` (matches current new-step default).
- If `step.delayUnit` is a valid `DelayUnit` AND (`isStoredDelayConsistent` holds; for `specificTime` additionally `step.specificDateTime` non-null) → use the stored unit. Value: days → `delayDays`; hours → `delayMinutes / 60`; minutes → `delayMinutes`; immediate/specificTime → 1. Exception: a stored relative unit whose value would be 0 (e.g. `minutes` with 0 minutes) is NOT accepted → fall through to inference.
- Otherwise infer from numbers, first match wins, in this order (an ordered array of `{ unit, matches, value }` entries):
  1. days > 0 and minutes = 0 → `days`, value = days
  2. days > 0 and minutes > 0 → `minutes`, value = days*1440 + minutes
  3. minutes > 0 and minutes % 60 = 0 → `hours`, value = minutes/60
  4. minutes > 0 → `minutes`, value = minutes
  5. else → `immediate`, value = 1
- `specificDateTime` view string: `toLocalDateTimeInputValue(step.specificDateTime)` when non-null, else `""` (regardless of unit — so the previously chosen date is still shown if the user switches back).

`delayViewToStored({ unit, value, specificDateTimeIso })` — a `Record<DelayUnit, (value) => { delayDays, delayMinutes }>`:
- days → `{ value, 0 }`; hours → `{ 0, value*60 }`; minutes → `{ 0, value }`; immediate → `{ 0, 0 }`; specificTime → `{ 0, 0 }`.
- `delayUnit` = unit. `specificDateTime` = `specificDateTimeIso ?? null` for `specificTime`, always `null` for every other unit.

`toLocalDateTimeInputValue` — same formatting as the existing `getOneHourFromNowLocal` in `delay-selector.tsx` / `use-delay-state.ts` (zero-padded month/day/hour/minute, local time). This replaces both duplicates in Task 2/3.

### Test cases (all required)

- round-trip for each of days(2), hours(2), minutes(30), immediate through `delayViewToStored` → `stepToDelayView`.
- stored `{0, 120, "minutes"}` → view `minutes/120` (NOT hours/2).
- stored `{0, 120, "hours"}` → view `hours/2`.
- stored `{0, 90, "hours"}` (inconsistent) → view `minutes/90`.
- stored `{0, 90, null}` → `minutes/90`; `{0, 120, null}` → `hours/2`; `{3, 0, null}` → `days/3`; `{1, 30, null}` → `minutes/1470`; `{0, 0, null}` → `immediate/1`.
- stored `{120, 0, "days"}` → `days/120` (accepted, consistent).
- stored `{0, 0, "minutes"}` → `immediate/1` (zero relative value not accepted).
- stored `{0, 0, "specificTime", specificDateTime: Date}` → `specificTime`, `specificDateTime` formatted local.
- stored `{0, 0, "specificTime", specificDateTime: null}` → `immediate/1`.
- stored `{0, 0, "bogus"}` → `immediate/1`.
- `undefined` → `days/1`.
- `delayViewToStored` for every unit, including `specificDateTime: null` for relative units and the ISO passthrough for specificTime.
- `isStoredDelayConsistent` table: every row above, positive and negative.
- `isDelayValueInRange`: 0 false, 1 true, 99_999 true, 100_000 false, 1.5 false, NaN false.
- `toLocalDateTimeInputValue(new Date(2026, 0, 5, 7, 3))` → `"2026-01-05T07:03"`.

Commit: `feat(sequences): add pure delay unit conversion helpers`

## Task 2: Save flow — schema, hooks, card

Files: `apps/builder/src/features/sequences/schema/action.ts`, `apps/builder/src/features/sequences/hooks/use-sequence-step.ts`, `apps/builder/src/features/sequences/hooks/use-delay-state.ts`, `apps/builder/src/features/sequences/components/sequence-step-card.tsx`, create `apps/builder/__tests__/upsert-sequence-step-schema.test.ts`.

Depends on Task 1 exports.

### `schema/action.ts`

- `delayUnit: z.enum(DELAY_UNITS).optional()` (import `DELAY_UNITS` from `../lib/delay`).
- `specificDateTime: z.iso.datetime().nullable().optional()`.
- Add `.superRefine` on `upsertSequenceStepRequest`: when `delayUnit`, `delayDays` and `delayMinutes` are ALL defined and `!isStoredDelayConsistent(...)`, add an issue on path `["delayUnit"]` with message `"delayUnit does not match delayDays/delayMinutes"`. When `delayUnit === "specificTime"` and all three are present, additionally require `specificDateTime` to be a non-null string (issue on `["specificDateTime"]`). Any payload missing one of the three delay fields is NOT checked (legacy partial payloads must pass unchanged).
- Tests in `upsert-sequence-step-schema.test.ts`: consistent triple passes for every unit; `days/0/120` fails; `hours/0/90` fails; `minutes/1/5` fails; partial `{ delayDays: 3 }` passes; partial `{ delayUnit: "hours" }` passes; `specificTime` with null date fails, with ISO passes; `specificDateTime: null` accepted on a relative unit; `delayUnit: "bogus"` fails.
- `buildUpdateData`/`buildCreateData` in the action already map `null` → `null`; do not change the action file.

### `hooks/use-sequence-step.ts`

- Import `DelayUnit`, `DelayView`, `delayViewToStored` from `../lib/delay`. Re-export `DelayUnit` (other files import it from here today) and keep exporting `Step`, `WEEKDAY_ORDER`.
- Remove props `currentDelayUnit` and `currentDelayValue` from `UseSequenceStepProps`.
- Replace `changedFields.delayUnit / delayValue / specificDateTime` with a single optional `delay?: { unit: DelayUnit; value: number; specificDateTime?: string }` (`specificDateTime` is the datetime-local string). Other fields unchanged.
- Payload building for the delay part: `const stored = delayViewToStored({ unit, value, specificDateTimeIso })` where `specificDateTimeIso = unit === "specificTime" && specificDateTime ? new Date(specificDateTime).toISOString() : null`; spread `delayDays`, `delayMinutes`, `delayUnit`, `specificDateTime` from `stored` into the payload. This clears `specificDateTime` (null) on every relative/immediate save.
- Validation for `specificTime` (must be in the future; after `previousStepTime` when not first) runs whenever `delay.unit === "specificTime"`, i.e. on both first pick and later edits.
- Replace the `isSavingRef` early-return with a FIFO queue:
  - `const saveQueueRef = useRef<Promise<void>>(Promise.resolve())`, `const pendingSavesRef = useRef(0)`.
  - `handleSave` validates and builds the full payload synchronously, increments `pendingSavesRef`, sets `isSaving` true, then chains `saveQueueRef.current = saveQueueRef.current.then(() => performSave(payload))`. `performSave` never rejects (it catches, toasts `messages.unknownError`, and resolves `false`); on success resolves `true` and calls `onSaved?.()`. After each item, decrement `pendingSavesRef`; when it reaches 0 set `isSaving` false and call `router.refresh()` exactly once.
  - `handleSave` returns `Promise<boolean>` (true = persisted). Validation failures resolve `false` without enqueuing.
- Keep `handleDelete`, `handleSelectFlow`, `handleActiveChange` behavior unchanged.

### `hooks/use-delay-state.ts`

- Delete the local `getOneHourFromNowLocal`, `getInitialDelayUnit`, `getInitialDelayValue`, `getInitialSpecificDateTime`. Initialize state from `stepToDelayView(step)`.
- Hold one `DelayView` state object (`view`) instead of three separate states; keep returning `delayUnit`, `delayValue`, `specificDateTime` and the three handlers so `sequence-step-card.tsx` and `DelaySelector` props stay the same.
- `onSave` type becomes `(fields: { delay: { unit: DelayUnit; value: number; specificDateTime?: string } }) => Promise<boolean>`.
- `handleDelayUnitChange(unit)`: next view = `{ ...view, unit }`; if `unit === "specificTime"` and `view.specificDateTime` is empty, set `specificDateTime = oneHourFromNowLocal()`. Optimistically set the view, then `onSave({ delay: nextView })`; if it resolves `false`, revert to the previous view.
- `handleDelayValueChange(value)`: next view = `{ ...view, value }`; same optimistic save + revert.
- `handleSpecificDateTimeChange(dateTime)`: next view = `{ ...view, unit: "specificTime", specificDateTime: dateTime }`; only save when `dateTime` is non-empty; same revert.
- Add `useEffect` that re-derives the view via `stepToDelayView(step)` when `step?.id`, `step?.delayDays`, `step?.delayMinutes`, `step?.delayUnit` or `step?.specificDateTime?.getTime()` change, so a server refresh with different data wins. No effect on first render beyond the initializer.

### `components/sequence-step-card.tsx`

- Remove the `currentDelayUnit` / `currentDelayValue` arguments.
- Pass `isSaving` to `TimeRangeSelector` as a new optional `disabled` prop ONLY if that component already exposes one; otherwise leave `TimeRangeSelector` untouched (Task 3 handles it).

Run `pnpm --filter builder test -- sequence`, `pnpm --filter builder check-types`, `pnpm lint`.

Commit: `fix(sequences): persist delay unit changes and queue step saves`

## Task 3: UI sync — DelaySelector and TimeRangeSelector

Files: `apps/builder/src/features/sequences/components/delay-selector.tsx`, `apps/builder/src/features/sequences/components/time-range-selector.tsx`, `apps/builder/src/features/sequences/components/sequence-step-card.tsx`.

Depends on Task 1 and Task 2.

### `delay-selector.tsx`

- Import `DelayUnit`, `DELAY_UNITS`, `isDelayValueInRange`, `MIN_DELAY_VALUE`, `MAX_DELAY_VALUE`, `oneHourFromNowLocal` from `../lib/delay`. Delete the local `DelayUnit` type and `getOneHourFromNowLocal`.
- Build `delayUnitItems` by mapping `DELAY_UNITS` to `{ value, label: t(\`sequences.delayUnits.${unit}\`) }` (translation keys already exist for every unit; keep the `t()` call type-safe with the project's typed messages — check `apps/builder/messages/en.d.json.ts` for how nested keys are typed and mirror an existing dynamic-key usage if one exists, otherwise use an explicit `Record<DelayUnit, string>` of labels).
- Replace the three inline `!localValue || localValue < 1 || localValue > 99_999` checks with `isDelayValueInRange(localValue)`; use `MIN_DELAY_VALUE` / `MAX_DELAY_VALUE` for the input `min`/`max`.
- Re-sync `localValue` when the `delayValue` prop changes: `useEffect(() => { setLocalValue(delayValue) }, [delayValue])`. Also clear `showDelayValueError` in that effect.
- Do not change the disabled behavior or layout.

### `time-range-selector.tsx`

- Add optional prop `disabled?: boolean` and forward it to every interactive control (radio/select/time inputs/day toggles) so they mirror the DelaySelector while a save is in flight. Default `false`.

### `sequence-step-card.tsx`

- Pass `disabled={isSaving}` to `TimeRangeSelector`.

Run `pnpm --filter builder test -- sequence`, `pnpm --filter builder check-types`, `pnpm lint`.

Commit: `fix(sequences): keep delay input in sync and disable send-window controls while saving`
