# Plan: Google Ads conversion options (dedup control, conversion time, consent)

Status: **implemented (P1-P10)**; the migration is generated but not applied, and
browser and real-Postgres verification are pending (see §13). Builds on
`2026-10-05-google-ads-conversions.md` and `2026-10-07-google-ads-upload-method.md`
(read both "As-built" sections first). The feature is not deployed: schema and
behaviour change freely; migrations stay generate-only (the owner applies them).
Decisions are in §2.

## 1. Goals and non-goals

**Goals**

1. Flow step and trigger action: Conversion action, then **Avoid duplicate
   conversions** (once per ad click / once per order or event ID, with a required ID
   field in ID mode), then Value / Currency; a collapsible **Additional options**
   containing only **Conversion time**.
2. A deterministic identity with no silent fallback: a missing ID is a visible failure.
3. Workspace-level **Conversion data consent** (ad user data, ad personalization) on
   the Google Ads settings page; survives disconnect; resolved per conversion in the
   worker; snapshotted on the event; sent by both transports and by "Validate request".
4. Timing: no clamping, no `occurredAt >= click` CHECK, advisory expiry rules that do
   not contradict Google (§6), malformed/future provided times rejected.
5. Event history shows the identity mode, the provided conversion time and the
   consent snapshot ("sent" vs "to send"/"not sent").
6. `google_ads_*` error codes are translated in the builder's Error Log.

**Non-goals (deferred)**: a third identity mode "Each new event" (§4.4), adjustments,
refunds and restatements, email/phone matching, customer type / value bucket, custom
variables, cart data, session attributes, IP, per-step consent override,
`uploadMethod` changes, backfill.

## 2. Decisions (binding)

| # | Decision |
|---|---|
| D1 | New shared field **Avoid duplicate conversions** right below Conversion action: `click` ("Once per ad click") or `id` ("Once per order or event ID", reveals a REQUIRED template-capable **Order or event ID**, ≤ 64 chars). Default follows the action's category (lead-like → `click`, other → `id`) until the admin changes it; the admin may override either way. The ID field is the only order/event ID input on the step. |
| D2 | Identity (§4.4): scoped by a workspace namespace (workspace + Google Ads account) and the conversion action; `id` mode excludes step/trigger ids (the same business ID from different steps dedups); `click` mode = per click + action; conversion time is never part of identity. The gbraid + ONE_PER_CLICK guard (`record-conversion.ts` ~L304) stays. |
| D3 | Missing / unresolved / empty / over-long ID → visible failure (flow step: error branch; trigger: Error Log + warn + stop). **No fallback**: identity never comes from message ids, job ids or an implicit once-per-click rule. |
| D4 | **No compatibility mode.** The feature is undeployed; only the §4.4 transaction-id formulas exist. |
| D5 | **"Each new event" deferred** (superseded: built later as the `event` policy, see `docs/google-ads-conversion-tracking.md` "Identity"; the key comes from the BullMQ job id plus the step or action, never a fresh UUID) until producers (trigger emitter `packages/events/src/trigger/emitter.ts`, the datetime evaluator, webhooks) carry a durable occurrence id that survives retries and republication. A fresh UUID, a timestamp or `{{current_time}}` is **prohibited** as identity; the later `event` policy accepts a BullMQ job id (with its creation time) only because a retry reuses both. The schema leaves room (§4.4). |
| Q1 | Consent survives disconnect: stored in workspace-owned `GoogleAdsSettings` (§3.1). |
| Q2 | No local rejection of provided times by a receipt margin; Google is authoritative. |
| Q3 | "Validate request" includes **fixed** consent values (variable sources omitted; the dialog says so). |
| Q4 | Strict future rejection with two named clocks: **`recordedAt`** (read before template resolution; used for a blank conversion time) and **`validationNow`** (read in `record` after resolution; used only for the future check). The 6 h delay uses click receipt and `now` at enqueue. |
| Q5 | "Learn more" → `https://support.google.com/google-ads-data-manager/answer/13944739` (Data Manager "Manage your connections", consent settings). Field meanings: `https://support.google.com/google-ads/answer/13802165`. |
| Q6 | `GoogleAdsSettings` stores ONE versioned `settings` jsonb, ready for future non-consent options: **yes**. |
| Q7 | Translate `google_ads_*` error codes in this work: **yes** (§7.5). |
| Q8 | A trigger occurrence key is **deferred** (same reason as D5). |
| V1 | Variable consent: empty/unresolved → omitted; non-empty value not `granted`/`denied` (case-insensitive, trimmed) → nothing recorded, Error Log names the setting (never the raw value); flow step error branch `google_ads_invalid_consent_value`, trigger warn + stop. |

## 3. Data model and migration

### 3.1 `GoogleAdsSettings` (new, workspace-owned)

Why here: `IntegrationGoogleAds` is deleted on disconnect
(`packages/connections/src/lifecycle.ts`); `Workspace` has no jsonb and is a hot cached
row; a one-row-per-workspace settings table follows `AIHandoverSettings`
(`packages/database/src/schema/ai-handover-settings.ts`). Workspace hard delete
(`packages/business/src/workspace-lifecycle/service.ts`) leaves low-volume tables to
the final `Workspace` FK cascade, so purge needs no new step; tenant is derived from
the workspace (no `tenantId`, invariant 10).

`packages/database/src/schema/google-ads-settings.ts`:

| Column | Type |
|---|---|
| `...sharedColumns` | id, createdAt, updatedAt |
| `workspaceId` | bigint NOT NULL, FK `Workspace.id` cascade, **unique** `GoogleAdsSettings_workspaceId_key` |
| `settings` | jsonb NOT NULL, **no `.default()`**, versioned `GoogleAdsSettingsDocument` (§4.1) |

No row = consent "absent". Relations file registered in
`packages/database/src/relations/index.ts` with **both** edits (invariant 2). Repository
`packages/database/src/repositories/google-ads-settings/`: `findByWorkspaceId`,
`upsertSettings({ workspaceId, settings })` (`ON CONFLICT ("workspaceId") DO UPDATE`), raw.

### 3.2 `GoogleAdsConversionEvent`

| Change | Notes |
|---|---|
| add `options jsonb` nullable, no default | Versioned snapshot (§4.1): identity, time source, consent. Written on every insert (the repository input type requires it); never updated. `null` only on pre-existing dev rows. |
| drop column `orderId` | The resolved ID lives in `options.identity.id`; one source of truth. |
| drop CHECK `GoogleAdsConversionEvent_occurred_after_click_check` | `googleClickReceivedAt` is a receipt proxy, later than the real click. |

The unique index `(workspaceId, transactionId)` stays and is what makes concurrent
inserts of one identity collapse.

### 3.3 Migration (ONE generated migration)

`pnpm --filter @chatbotx.io/database make:migration google_ads_conversion_options`;
expected SQL (inspect; owner applies):

```sql
CREATE TABLE "GoogleAdsSettings" (… sharedColumns …, "workspaceId" bigint NOT NULL, "settings" jsonb NOT NULL);
ALTER TABLE "GoogleAdsSettings" ADD CONSTRAINT … FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON DELETE cascade ON UPDATE cascade;
CREATE UNIQUE INDEX "GoogleAdsSettings_workspaceId_key" ON "GoogleAdsSettings" ("workspaceId");
ALTER TABLE "GoogleAdsConversionEvent" ADD COLUMN "options" jsonb;
ALTER TABLE "GoogleAdsConversionEvent" DROP COLUMN "orderId";
ALTER TABLE "GoogleAdsConversionEvent" DROP CONSTRAINT "GoogleAdsConversionEvent_occurred_after_click_check";
```

No backfill; `schema-default-parity.test.ts` unaffected.

## 4. Contracts and flows

### 4.1 Zod contracts

**Settings + consent** — `packages/database/src/partials/google-ads.ts`:

```ts
export const googleAdsConsentSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notProvided") }),
  z.object({ type: z.literal("granted") }),
  z.object({ type: z.literal("denied") }),
  z.object({ type: z.literal("variable"),
    template: z.string().trim().min(1, "googleAds.consent.validation.templateRequired")
      .max(200, "googleAds.consent.validation.templateTooLong")
      .refine(containsVariablePlaceholder, "googleAds.consent.validation.templateRequired") }),
])
// The form/action/service shape (unwrapped, no version):
export const googleAdsConsentSchema = z.object({ adUserData: googleAdsConsentSourceSchema, adPersonalization: googleAdsConsentSourceSchema })
// The stored document (versioned; future options are added as new optional keys or v2):
export const googleAdsSettingsV1Schema = z.object({ version: z.literal(1), consent: googleAdsConsentSchema })
export const googleAdsSettingsDocumentSchema = z.discriminatedUnion("version", [googleAdsSettingsV1Schema]) // unknown version = failure
export const NOT_PROVIDED_CONSENT = { adUserData: { type: "notProvided" }, adPersonalization: { type: "notProvided" } } as const
```

**Event options** — same file:

```ts
export const googleAdsIdentityPolicyValues = ["click", "id"] as const // "event" reserved (D5)
const identitySnapshotSchema = z.object({
  version: z.literal(1),
  configuredPolicy: z.enum(googleAdsIdentityPolicyValues),
  effectivePolicy: z.enum(googleAdsIdentityPolicyValues), // equal today (no fallback); kept for future modes
  keySource: z.enum(["click", "explicit"]),
  id: z.string().min(1).max(64).nullable(),               // resolved business ID in `id` mode, else null
})
const consentSnapshotEntrySchema = z.object({
  status: z.enum(["granted", "denied"]).nullable(),       // null = omitted
  source: z.enum(["notProvided", "fixed", "variable"]),
})
export const googleAdsEventOptionsV1Schema = z.object({
  version: z.literal(1),
  identity: identitySnapshotSchema,
  timeSource: z.enum(["recorded", "provided"]),
  consent: z.object({ adUserData: consentSnapshotEntrySchema, adPersonalization: consentSnapshotEntrySchema }),
})
export const googleAdsEventOptionsSchema = z.discriminatedUnion("version", [googleAdsEventOptionsV1Schema])
```

Never stored: templates, raw resolved consent text, contact data beyond the business ID
the admin chose to send.

**Step/trigger fields** — `packages/flow-config/src/steps/send-google-ads-conversion.ts`:

```ts
export const googleAdsDedupModeSchema = z.enum(["click", "id"])
// lenient on purpose: the 64-character limit is checked by the refinement, in `id` mode only
const dedupIdStaticSchema = z.string().trim().min(1)
// googleAdsConversionFieldsSchema:
//   conversionActionId (unchanged), value, currency (unchanged),
//   dedupMode: googleAdsDedupModeSchema,
//   dedupId: optionalTemplateOrStatic(dedupIdStaticSchema),
//   conversionTime: optionalTemplateOrStatic(conversionTimeStaticSchema)
// no separate orderId field
export const requireDedupIdForIdMode = (data, ctx) => {        // added to withGoogleAdsConversionRefinements
  if (data.dedupMode === "id") {
    if (!data.dedupId) ctx.addIssue({ code: "custom", path: ["dedupId"], message: "googleAds.conversionFields.validation.dedupIdRequired" })
    else if (data.dedupId.length > 64 && !containsVariablePlaceholder(data.dedupId))
      ctx.addIssue({ code: "custom", path: ["dedupId"], message: "googleAds.conversionFields.validation.dedupIdTooLong" })
  }
}
```

The ID's length is validated only in `id` mode, by the refinement; a template is not
length-checked statically (the runtime `resolvedDedupIdSchema` validates the resolved
value). A value left in the hidden ID field in `click` mode never blocks saving, and
the runtime ignores it.

`conversionTimeStaticSchema`: format + calendar validity only ("future" is runtime).
`dedupMode` is **required in the zod schema (no `.default()`)**: MCP/CLI flow-spec
authors must choose it, and its `.describe()` states the recommendation (lead-like →
`click`, otherwise `id` with `dedupId`). Dev-only saved steps that predate the field
fail validation when reopened and are re-saved by hand (undeployed feature, no
migration of step configs).
`.describe()` texts updated (they surface in the MCP/CLI flow spec; run the
`cli-mcp-docs` drift check). Default fns: `dedupMode: "id"`, `dedupId: undefined`,
`conversionTime: undefined` (the UI re-defaults `dedupMode` by category, §7.1). Builder
trigger default (`features/triggers/components/actions/schema/send-google-ads-conversion.ts`)
mirrors it; the worker trigger schema inherits it. Existing English refinement
messages become i18n keys.

**Pure helpers** — `packages/utils/src/google-click.ts`: `isRfc3339WithZone`,
`parseConversionTime(value): Date | null` (UTC, whole seconds), and the shared
`googleAdsConversionErrorCodes` map moved here from
`apps/worker/src/integration/handlers/google-ads/google-ads-input-error.ts` so the
builder can translate them (§7.5).

**Business** — `packages/business/src/google-ads/schema.ts`, new `consent.ts`,
`transaction-id.ts` (no `@chatbotx.io/variables` import: cycle at
`packages/variables/src/utils.ts:1`):

- `resolvedDedupIdSchema`: trim; empty or still containing `{{` → `missing`; > 64 →
  `invalid`.
- `resolvedConversionTimeSchema(validationNow)`: blank → `undefined`; else
  `malformed` | `future`.
- `consentTemplatesOf(consent)`, `toConsentInput(consent, resolved)` →
  `{ ok: true; consent } | { ok: false; setting }`; `googleAdsConsentInputSchema`.
- `RecordConversionInput`: `recordedAt: Date`, `dedupMode`, `dedupId?: string`,
  `conversionTime?: string`, required `consent`; no `orderId`, no `triggerMessageId`.
- Refusals: `missingDedupId`, `invalidDedupId`,
  `invalidConversionTime { reason: "malformed" | "future" }`.
- `googleAdsSettingsService` (`packages/business/src/google-ads-settings/service.ts`):
  `getConsent(workspaceId)` → `{ status: "absent"; consent: NOT_PROVIDED } |
  { status: "ok"; consent } | { status: "invalid" }`; `updateConsent(workspaceId,
  consent)` writes `{ version: 1, consent }` (today the document holds only consent;
  when another option is added this becomes read-merge-write in one transaction).
  **No `withCache`** (unlike the sibling `AIHandoverSettings` service): one indexed row
  per conversion is cheap, and skipping the cache means `updateConsent` needs no
  invalidation step and a saved change applies to the very next conversion.

**Independent consent load.** Consent never goes through the setup converters (they
receive `null` when nothing is connected). Each consumer calls `getConsent` and maps it
with one builder helper `lib/to-consent-view.ts` → `GoogleAdsConsentView =
{ status; adUserData: { type; template: string | null } | null; adPersonalization: … }`.

| Consumer | Load | Test |
|---|---|---|
| Worker producers (§4.2) | `resolve-conversion-inputs.ts` | P4: loads with no connection (record then refuses `noAccount`) |
| Settings page loader (`app/…/settings/integrations/google-ads/page.tsx`) | `Promise.all`, new `consent` prop on `GoogleAdsSettings` | P6 loader test with `setup = null` |
| `getIntegration` oRPC (`api/index.ts`) | handler composes `getPublicSetup` + `getConsent`; resource gains `consent` and `uploadMethod` (null when not connected) | P6 `google-ads-api.test.ts` |
| Validate request (§5.3) | `validateIngest` | P5 |

### 4.2 Producer flow (shared helper)

`apps/worker/src/integration/handlers/google-ads/resolve-conversion-inputs.ts`:

1. `recordedAt = new Date()` (before resolution; Q4).
2. `getConsent(workspaceId)`; `invalid` → `{ error: "google_ads_invalid_consent_config" }`.
3. ONE `resolveContactVariablesDeep` over
   `{ value, currency, dedupId, conversionTime, consent: consentTemplatesOf(consent) }`.
4. `toConsentInput`; `ok: false` → `{ error: "google_ads_invalid_consent_value", setting }`.
5. Return `{ recordedAt, dedupMode, value, currency, dedupId, conversionTime, consent }`.

**Flow step** (`send-google-ads-conversion-step-handler.ts`, has an error branch):
helper error or refusal `missingDedupId` / `invalidDedupId` / `invalidConversionTime`
/ `invalidValue` → Error Log + `errorResult(code)`. Identity uses only `dedupId` or the click.

**Trigger action** (`apps/worker/src/trigger/services/action-executor.ts`, **no error
branch**): same helper after click-inbox resolution and `safeParse`; the same failures
→ Error Log + `baseLogger.warn` + `break`.

Error Log text: line 1 is always the code (translated by the builder, §7.5). Detail
lines are one `<path>: <message>` line per zod issue, then `Resolved: …` / `Setting: …` /
`Trigger: …`. Consent
failures use `describeGoogleAdsConsentFailure(code, setting)` and never pass through
`describeGoogleAdsInputFailure`, whose resolved dump stays `{ value, currency, dedupId,
conversionTime }` (no `consent` key; pinned by a test).

New codes: `google_ads_invalid_consent_config`, `google_ads_invalid_consent_value`,
`google_ads_invalid_conversion_time`, `google_ads_missing_dedup_id`,
`google_ads_invalid_dedup_id`.

### 4.3 Business record (`record-conversion.ts`)

1. Validate value/currency, `dedupMode`/`dedupId` (`id` mode requires a valid ID; in
   `click` mode a provided ID is ignored and not stored), consent, and conversion time
   against `validationNow = new Date()` (read here, after resolution).
2. Attribution / setup / external-attribution guards (unchanged); gbraid +
   ONE_PER_CLICK → `incompatibleAction` (unchanged, applies to both modes).
3. `occurredAt = conversionTime ?? recordedAt`; no clamp (delete ~L243–248).
4. `transactionId = buildTransactionId({ workspaceId, conversionCustomerId, conversionActionId, mode, clickId, dedupId })` (§4.4).
5. `insertIgnoreDuplicate({ …, occurredAt, transactionId, options })`.
6. First delay `computeSendDelayMs(click.receivedAt, now)`.
7. Duplicate → existing row untouched; its `options`/`occurredAt` win.

Back-dated events carry the consent resolved at record time.

### 4.4 Identity (D2–D5)

| Mode | `transactionId` (sent to Data Manager) | Snapshot |
|---|---|---|
| `click` | `gads-v2-{conversionActionId}-c-{sha256(ns + ":" + clickId)[0..32]}` | `keySource: "click"`, `id: null` |
| `id` | `gads-v2-{conversionActionId}-i-{sha256(ns + ":" + dedupId)[0..32]}` | `keySource: "explicit"`, `id: dedupId` |

`ns = workspaceId + ":" + conversionCustomerId`. Both are inputs of `record` resolved
**before** the insert (the workspace of the request and the conversion customer of the
resolved setup); they are also what the row later stores, so a replay from the row
rebuilds the same id.

- **Workspace namespace (both modes).** Several workspaces can upload to the same
  Google conversion action (shared account or manager). Without `ns`, two workspaces
  sending order `1042` would produce the same provider id and Google would drop the
  second one as a duplicate: Data Manager reports `DUPLICATE_TRANSACTION_ID` ("a
  conversion with the same order id and conversion action combination was already
  uploaded"), legacy answers `ORDER_ID_ALREADY_IN_USE`. (The "later upload updates the
  value" behaviour in the Data Manager guide applies only to matching a tag-recorded
  conversion with an offline one, not to two API uploads.)
  With `ns` their ids differ; within one workspace the same key always maps to the
  same id. `conversionCustomerId` in `ns` keeps ids distinct when a workspace switches
  to another Google Ads account. The `(workspaceId, transactionId)` unique index stays.
- Scoped by conversion action (the action id stays readable in the id; two funnel
  actions never collide); `id` mode has no step/trigger/contact/inbox component, so the
  same business ID from different steps, triggers or reruns dedups; `click` mode = one
  per click per action.
- Hashing keeps the id fixed-length (≤ 59 chars with a 16-digit action id: 8 + 16 +
  3 + 32) and keeps the business ID and click id out of the provider key; the prefix
  `gads-v2-` marks the identity format. 32 hex chars = 128 bits, collision-safe, and
  the whole id stays under Google's documented 64-character transaction ID limit
  (`support.google.com/google-ads/answer/6386790`). Conversion time, value and consent
  never participate.
- Google scopes the id **per conversion action** (both APIs say so: legacy "an order id
  can only be used for one conversion per conversion action"; Data Manager
  `DUPLICATE_TRANSACTION_ID` is "order id and conversion action combination"), which is
  exactly the scope our formula encodes.
- Legacy: `orderId = legacyOrderId(transactionId)` (43 chars). Its `v1-` prefix names
  the legacy order-id *format*, not the identity version, and stays as is; only the
  input (`gads-v2-…`) changes.
- `buildTransactionId` takes only the inputs above; `isLeadLikeCategory` is used only
  by the UI default.
- **Room for "Each new event" (D5)** without a migration: `options` is jsonb with a
  versioned `identity` block and a policy enum that can gain `"event"`
  (`keySource: "occurrence"`, `id` = durable occurrence id) under `identity.version: 2`;
  the step field enum is extended the same way; a new `gads-v3-…-e-…` prefix keeps ids
  disjoint.

## 5. Delivery mapping

`delivery.ts` parses `event.options`: `null` → no consent; failure → terminal
`failed(delivery)` "Unsupported conversion options version", no HTTP call. Consent
flows as `GoogleAdsIngestEvent.consent?` (`integrations/google-ads/src/schemas.ts`).

### 5.1 Data Manager (`apis/data-manager.ts` `buildEvent`)

| Source | Field | Sent |
|---|---|---|
| `transactionId` | `transactionId` | `gads-v2-…` (§4.4) |
| adUserData granted / denied / null | `consent.adUserData` | `"CONSENT_GRANTED"` / `"CONSENT_DENIED"` / omitted |
| adPersonalization granted / denied / null | `consent.adPersonalization` | same mapping |
| both null | `consent` | omitted |
| — | `eventSource` / `eventTimestamp` | `"MESSAGE"` / `occurredAt.toISOString()` |

Remove the `TODO(consent)`.

### 5.2 Legacy (`apis/legacy-upload.ts` `buildConversion`)

| Source | Field | Sent |
|---|---|---|
| `transactionId` | `orderId` | `legacyOrderId(transactionId)` (hashed) |
| adUserData granted / denied / null | `consent.adUserData` | `"GRANTED"` / `"DENIED"` / `consent` omitted |
| adPersonalization | — | never (v25 proto: only for OfflineUserDataJobService / UserDataService) |
| — | `conversionDateTime` | `formatLegacyDateTime(occurredAt)` |

Replays are byte-identical (rule C3 of `2026-10-07-google-ads-upload-method.md`): identity and consent come from the immutable row.

### 5.3 Validate request (Q3)

`validateIngest` loads `getConsent` itself: fixed sources mapped; variable /
notProvided omitted; `invalid` → refused with `googleAds.consent.invalidStored`. The
consent then goes through the SAME transport filter as delivery
(`consentForTransport(consent, uploadMethod)` in `packages/business/src/google-ads/consent.ts`,
used by `delivery.ts` too), which returns what is actually sent plus what is withheld.
`validateIngest` returns that as `consentSummary: { adUserData: "granted" | "denied" |
"omitted"; adPersonalization: "granted" | "denied" | "omitted" | "notSentLegacy" }`, plus
`variableSkipped: boolean`, and the dialog renders only this summary: on a legacy
connection a fixed ad personalization value is shown as "not sent (legacy upload
method)", never as included; contact-field consent is shown as "can't be tested". As built, `validateIngest` also returns an optional `withheldAdPersonalization: "granted" | "denied"`, set only together with `adPersonalization: "notSentLegacy"`, so the dialog can name the withheld value ("Ad personalization (Granted) is not sent with the legacy upload method"); it is display-only and is never sent to Google.

## 6. Timing and expiry

Our checks are **advisory, receipt-based approximations** (`googleClickReceivedAt` can
be days after the real click). Google is authoritative; `EXPIRED_EVENT` /
`CONVERSION_PRECEDES_EVENT` (legacy) and their Data Manager equivalents are terminal
(only `RETRYABLE_REASONS` in `processing-status.ts` redrive).

Data Manager `ProcessingErrorReason` names (verified in the `requestStatus.retrieve`
reference; Google may prefix them with `PROCESSING_ERROR_REASON_`, which
`normalizeReason` strips): `EVENT_TOO_OLD` ("older than max supported age"),
`TOO_RECENT_CLICK` (retryable, already in `RETRYABLE_REASONS`),
`CONVERSION_PRECEDES_CLICK`, `CLICK_NOT_FOUND`, `INVALID_CLICK`, `DENIED_CONSENT` ("ad
user data is denied, either by the user or in the advertiser default settings"),
`NO_CONSENT`, `DUPLICATE_TRANSACTION_ID` ("same order id and conversion action
combination was already uploaded"), `DUPLICATE_GCLID` ("same GCLID and conversion time
already exists").

**Duplicate recovery on Data Manager (new, P5).** A redrive or manual retry can re-ingest
an event Google already processed, although the conversion is recorded. Mirror the legacy
classifier: when every `errorCounts` reason is `DUPLICATE_TRANSACTION_ID` or
`DUPLICATE_GCLID`, the outcome is `{ kind: "duplicate" }` and housekeeping finishes the
event as `processed` (`processingStatus: success`) with `duplicateRecovery: true` stored
in `processingDetail` (diagnostics only; the history row shows a plain Processed). Any
other reason keeps precedence over a duplicate, as in `upload-errors.ts`.

| # | Rule | Design |
|---|---|---|
| R0 | Stored time | `occurredAt` is stored as given; no clamp, no `occurredAt >= receipt` CHECK |
| A | Click age at delivery | `now − receipt > 90 d` → `skipped_expired` |
| B | Click → conversion | `occurredAt − receipt > lookback` (null → 90 d) → `skipped_expired` |
| R3 | Conversion age | no local rule (Google decides) |
| R4 | 6 h gate | from receipt |
| R5 | Provided time | malformed / future → refusal; no receipt-margin check (Q2) |

The action lookback bounds click → conversion only; delivery − receipt is bounded by
90 d alone.

Timing tests (`google-ads-timing.test.ts`, receipt R): fresh (30, R+1d, R+2d → no);
B boundary/exceeded (30, R+30d / R+30d+1s, R+31d → no / yes); conversion inside the
lookback but delivered after it (30, R+10d, R+40d → **no**); A boundary/exceeded (90, R+1d, R+90d / +1s → no / yes);
null lookback (R+89d → no); lookback 120 (R+100d, R+100d → yes by A); conversion
before receipt (R−1h → no); conversion 100 d before receipt → no locally.

Provider-authoritative tests: delayed capture (real click 95 d ago, receipt 85 d ago):
sent, Data Manager expired reason → `failed(processing)` without redrive; legacy
`EXPIRED_EVENT` → terminal `failed(delivery)`; same for `CONVERSION_PRECEDES_EVENT`.

Lifecycle tests (current clocks: delays/redrives from receipt; sweeper on
`updatedAt < now − 10 min` AND `googleClickReceivedAt < now − 6 h`,
`housekeeping.ts` ~L446 / repository ~L494): initial delay ignores back-dated
`occurredAt`; vanished job redriven with unchanged `options`; manual retry sends the
same snapshot; processing redrive 6 h, same snapshot; expiry at actual delivery →
`skipped_expired`, no HTTP; duplicate record with different time/consent keeps the
first snapshot.

## 7. UI / UX spec

All strings via `useTranslations()`. Every Google Ads template input (Value, Currency,
Order or event ID, Conversion time, consent template) uses `GoogleAdsTemplateField`
(§7.0). Dedup radio: feature-local `GoogleAdsDedupModeField` (§7.1). Alerts: `NoticeAlert`. Sections: `SettingsSection`. Disclosure: `Collapsible` as in
`features/meta-conversions/components/meta-capi-event-fields.tsx:244`.

**Form-control audit** (every bound control this plan uses, checked against
`packages/ui/src/components/form/*`; values change programmatically through category
defaults and `form.reset`, so each must render `field.value` controlled):

| Control | Used for | Source behaviour | Plan |
|---|---|---|---|
| `RadioGroupField` | — | uncontrolled: `defaultValue={field.value}`, `onValueChange={field.onChange}`, no caller callback (`radio-group-field.tsx`) | **not used**; the shared component stays unchanged; dedup mode uses `GoogleAdsDedupModeField` |
| `SelectField` | conversion action (existing); consent source per setting, bound to `adUserData.type` / `adPersonalization.type` | controlled: `value={field.value ?? ""}`, `onValueChange` → `field.onChange` + optional `triggerValueChange` (`select-field.tsx` ~L127–141) | safe; `form.reset` updates the visible selection (tested in P9) |
| `PlainTextEditorField` | — | value read on mount only | **not used**; template inputs use `GoogleAdsTemplateField` (§7.0) |
| Switch / Checkbox fields | — | — | none planned |

### 7.0 `GoogleAdsTemplateField` (feature-local, opt-in)

The shared `PlainTextEditorField` (14 users) is **not changed**. New
`features/integration-google-ads/components/google-ads-template-field.tsx` renders
`FormField` + `PlainTextTiptapEditor` directly:

- **Blur → RHF**: wrapper `onBlur` (focusout) calls `field.onBlur()` only when
  `relatedTarget` is outside the wrapper. The variable picker
  (`PlainTextTiptapEditor`'s `PopoverContent`) portals to `<body>` by default, so the
  adapter turns on `inlineVariablePicker`, which passes `portal={false}` to that
  `PopoverContent`; the shared `PopoverContent` already supports this (it renders the
  Base UI Portal into a local container, `packages/ui/src/components/ui/popover.tsx`
  ~L30–67). The picker's DOM is then inside the wrapper: focus moving into it is not a
  blur (no validation, no applying a deferred reset); choosing a variable refocuses the
  editor; focus leaving the picker to anything outside the wrapper is a blur.
- **Accessible names**: `contenteditable` gets `aria-labelledby`, `aria-describedby`
  (helper + error), `aria-invalid`; errors via `TranslatedFieldMessage` (`role="alert"`).
- **Value sync**: the adapter owns `initValue` (the editor's effect ~L172 calls
  `setContent`). `lastEmittedRef` tracks the last text sent to `field.onChange`; a
  differing `field.value` is external (reset/setValue): applied now if unfocused, on
  blur if focused. Any `setContent` echo is ignored via `lastEmittedRef`. A user edit while a reset is deferred cancels the deferral (the edit goes through `field.onChange`, so form and editor agree); an external value equal to `lastEmittedRef` also cancels any pending deferral.
- **Shared code changes (exactly two default-off props on `PlainTextTiptapEditor`;
  `PlainTextEditorField` and `PopoverContent` are untouched)**:
  `editorAttributes?: Record<string, string>` merged into `editorProps.attributes` after
  `class` (ARIA must sit on tiptap's `contenteditable`, reachable only there), and
  `inlineVariablePicker?: boolean` (default `false`) forwarded as
  `portal={!inlineVariablePicker}` to the variable picker's `PopoverContent`. No other
  user passes either (DOM snapshot-pinned for an existing host). The inline picker must
  not be clipped by the flow step dialog's scroll container; checked in the P8 browser
  pass.

> **UI revision after browser testing (supersedes the wireframes and radio wording in
> §7.1 and §7.2; behavior rules there still hold).** Step / trigger form: the conversion
> action and the dedup mode are plain full-width selects with **no labels** (the
> placeholder names the action select); the dedup select shows only when an action is
> chosen, and the one-line explanation of the selected mode (or its override note)
> appears **under the select**. There is no `GoogleAdsDedupModeField` and no radio
> group; `dedupModeClick` / `dedupModeId` are the option labels. Order ID, Value and
> Currency are `GoogleAdsTemplateField`s that also offer raw custom-field variables
> (`includeRawCustomFieldVariables`); Value and Currency sit side by side only when the
> panel is wide (container query), else stacked. Conversion time uses the shared
> date picker (`FieldValuePickerPopover`, `valueFormat` RFC 3339 with offset) plus
> `{{variable}}` input. The footer is one short line ("Only for contacts from a Google
> ad click.") with a new-tab link titled "Conversion data consent"; it turns amber with a
> fix link when the saved consent is unreadable. The consent summary and legacy note were
> removed from the footer. Validation errors on the template fields show only after the
> field is touched or edited (the flow editor autosaves and validates on open).
> Settings, consent section: per-setting descriptions were removed; each row is
> label (left, top aligned) + select + a one-line helper, with a short section
> description; the legacy warning and helpers were shortened in all 21 locales. The
> inline variable picker raises its bar to `z-30` while open so it is not covered by
> the next field's picker button. Stats dashboard: no title, description or basis line;
> filters right aligned.

### 7.1 Step / trigger form (`google-ads-conversion-fields.tsx`, both hosts)

Desktop, purchase action (ID mode), Additional options collapsed:

```
┌ Send Google Ads conversion ──────────────────────────────────────┐
│ Conversion action *                                              │
│ [ Purchase (PURCHASE)                                        ▾ ] │
│ Avoid duplicate conversions *                                    │
│ ( ) Once per ad click                                            │
│     Counts this conversion action once for each ad click.        │
│ (•) Once per order or event ID                                   │
│     Order or event ID *                                          │
│     [ {{order_number}}                                     {} ]  │
│     Reuse the same ID for retries and imports. Use a different   │
│     ID for each purchase or event.                               │
│     No order ID in chat sales? Combine the contact with a field  │
│     you set per sale, e.g. {{user_id}}-{{order_number}}.         │
│ Value                              Currency                      │
│ [ {{order_total}}              ]   [ USD                       ] │
│ ▸ Additional options                                             │
│ ⓘ Consent: ad user data – from {{gdpr_consent}} · ad             │
│   personalization – not provided.  Change in settings ↗          │
│ Conversions are only sent for contacts who arrived from a        │
│ Google ad click.                                                 │
└──────────────────────────────────────────────────────────────────┘
```

(`{{user_id}}` is the built-in contact id, `packages/variables/src/utils.ts` ~L376;
`{{order_number}}` stands for a contact custom field the workspace defines — custom
fields resolve by name. `{{current_time}}` is explicitly called out as unsuitable: it
changes on every run.)

Lead action (click mode default), Additional options expanded with an error:

```
│ Conversion action *                                              │
│ [ Submit lead form (SUBMIT_LEAD_FORM)                        ▾ ] │
│ Avoid duplicate conversions *                                    │
│ (•) Once per ad click                                            │
│     Counts this conversion action once for each ad click.        │
│ ( ) Once per order or event ID                                   │
│ …                                                                │
│ ▾ Additional options · 1 set                                     │
│   Conversion time                                        optional│
│   [ 2026-10-08 14:30                                         ]   │
│   Leave blank to use the time this step runs. Otherwise a date   │
│   with a timezone, e.g. 2026-10-08T14:30:00+07:00. Can't be in   │
│   the future.                                                    │
│   ⚠ Use a date with a timezone, e.g. 2026-10-08T14:30:00+07:00.  │
```

375 px (ID mode):

```
┌ Send Google Ads conversion ─────┐
│ Conversion action *             │
│ [ Purchase (PURCHASE)       ▾ ] │
│ Avoid duplicate conversions *   │
│ ( ) Once per ad click           │
│     Counts this conversion      │
│     action once for each ad     │
│     click.                      │
│ (•) Once per order or event ID  │
│     Order or event ID *         │
│     [ {{order_number}}     {} ] │
│     Reuse the same ID for       │
│     retries and imports. …      │
│ Value                           │
│ [ {{order_total}}             ] │
│ Currency                        │
│ [ USD                         ] │
│ ▸ Additional options            │
│ ⓘ Consent: … Change in          │
│   settings ↗                    │
└─────────────────────────────────┘
```

Invalid saved consent (any host): amber line "Consent settings can't be read, so this
step will fail. Fix them in settings ↗".

Interaction:

- **Default by category**: the component keeps an `isDedupModeExplicit` flag (React
  state, independent of RHF dirty, which clears when a value returns to its default).
  It starts `true` when the step opens with a conversion action already chosen (a saved
  step keeps its saved mode on mount) and becomes `true` on any user change of the radio
  (user `onValueChange`; programmatic `setValue` never sets it). While it is `false`,
  choosing a conversion action sets `dedupMode` to `click` for `isLeadLikeCategory`
  actions, else `id`. Once `true`, the mode is never changed automatically.
- **ID field**: rendered only in `id` mode, outside the radio group, directly below the
  last option (`id` is last) and indented (`aria-describedby` → help + example); hidden
  in `click` mode but its value is kept (switching back restores it). It is validated
  only in `id` mode: required ("Enter an order or event ID, or choose Once per ad
  click.") and at most 64 characters when static ("Use 64 characters or fewer."), on
  blur/save; a hidden click-mode value never blocks saving.
- **Override notes** (muted): lead-like + `id` → `dedupLeadIdNote` ("Each different ID
  counts as a new lead from the same click."); non-lead + `click` → `dedupClickNote`
  ("Repeat purchases from the same click won't be counted."). Legacy connection + `id`
  → `dedupLegacyNote` (Google receives a scrambled ID).
- **`GoogleAdsDedupModeField`** (`apps/builder/src/features/integration-google-ads/components/google-ads-dedup-mode-field.tsx`,
  feature-local; the shared `RadioGroupField` is unchanged): built from `FormField` /
  `FormItem` / `FormLabel` (`@chatbotx.io/ui/components/ui/form`; not `FormFieldWrapper`,
  whose label has no id for `aria-labelledby`) + `RadioGroup` / `RadioGroupItem`
  (`@chatbotx.io/ui/components/ui/radio-group`) + `Label` — with
  `value={field.value}` (controlled) and
  `onValueChange={(v) => { field.onChange(v); onUserChange() }}`, where `onUserChange`
  sets `isDedupModeExplicit`. The primitive's `onValueChange` fires only on user
  interaction, and the category default uses `form.setValue`, so a programmatic change
  updates the checked radio without marking it explicit. The ID input (props
  `idField: ReactNode`) renders outside the `RadioGroup`, directly below the last option,
  because the radio group is a composite widget that moves the selection on arrow keys
  and would hijack the caret of the contenteditable editor and its inline picker. A11y: the group has
  `aria-labelledby` = the field label ("Avoid duplicate conversions") and
  `aria-required`; each item is labelled by its `Label` and described by its help text
  (`aria-describedby`); arrow keys move and select, Tab enters/leaves the group.
- **Disclosure**: holds only Conversion time. Independent `open` state: initialised
  on mount to `Boolean(conversionTime) || hasError(conversionTime)`; an effect sets it
  `true` when a conversionTime error appears that was not there before (e.g. after
  submit); otherwise only the user toggles it, so collapsing with a value set is
  allowed and shows "· 1 set" on the trigger. `keepMounted`;
  `motion-reduce:transition-none`.
- **Conversion time**: no "RFC3339" in UI; static values format-checked on blur/save;
  "future" only at run time.
- **Consent line**: from `getIntegration` (`consent`, `uploadMethod`), also when not
  connected; absent → `consentNone`; ok → `consentSummary` (+ `consentLegacyNote`);
  invalid → amber warning.
- **Node summary** (`lib/conversion-summary.ts`): "Once per ad click" or "ID:
  {dedupId}" (`googleAds.summary.dedupClick` / `dedupId`).

### 7.2 Settings: "Conversion data consent" section

Placement (`google-ads-settings.tsx`): ConnectionRow → AccountPicker →
ConversionActionsSection (when connected) → **ConsentSection (always)** →
EventsHistorySection. Files: `components/consent-section.tsx`,
`components/consent-source-field.tsx`, `actions/update-consent.action.ts`.
`consent-source-field.tsx` renders a `SelectField` bound to `<setting>.type`
(controlled, see the §7 form-control audit) and, for `variable`, a `GoogleAdsTemplateField`
bound to `<setting>.template`; the schema's `z.object` strips a leftover `template` when
another source is chosen.

Desktop:

```
Conversion data consent                                      [ Save ]
Tell Google whether your contacts agreed to share their data for ads.
Applies to every conversion this workspace sends. Learn more ↗
──────────────────────────────────────────────────────────────────────
Ad user data                                 [ From a contact field ▾ ]
Whether the contact agreed that their data   [ {{gdpr_consent}}       ]
may be sent to Google for advertising.       Accepted values: "granted"
                                             or "denied" (any case). An
                                             empty field is not sent; any
                                             other value fails the step.
Ad personalization                           [ Not provided         ▾ ]
Whether the contact agreed to personalized   ChatbotX leaves this field out
ads.                                         of the upload, so Google applies
                                             your account's default consent
                                             setting. If that default is "not
                                             consented", Google won't record
                                             these conversions.
```

| Value | Label | Helper |
|---|---|---|
| `notProvided` (default) | Not provided | ChatbotX leaves this consent field out of the upload, so Google applies the default consent setting of your Google Ads account or data connection. If that default is "not consented", Google won't record these conversions. |
| `granted` | Always granted | Every conversion says the contact agreed. Only use this if you collect consent before the chat. |
| `denied` | Always denied | Every conversion says the contact did not agree. Google won't record conversions whose ad user data consent is denied. |

Why the copy is this explicit: Data Manager fails such events with `DENIED_CONSENT`
("denied, either by the user or in the advertiser default settings"), and the legacy
guide warns that without consent "it's possible that your conversions won't be
attributable". "Always denied" therefore stays available (it is the truthful statement
when the contact refused) but never reads as a neutral choice. The account default
lives in Data Manager → connection → "Manage default consent settings" (the Q5 link).
| `variable` | From a contact field | Reveals the template input + accepted-values helper. |

Legacy (`setup.uploadMethod === "legacy"`): `NoticeAlert tone="warning"` (`role="status"`)
under Ad personalization: "Not sent with the legacy upload method" / "Google's legacy
upload API only accepts ad user data consent. Your choice is saved, but Google won't
receive it until this workspace is reconnected with Data Manager."

375 px: label/description stack above the control; Save at the bottom, full width.

```
Conversion data consent
Tell Google whether your contacts
agreed to share their data for
ads. … Learn more ↗
─────────────────────────────────
Ad user data
Whether the contact agreed that …
[ From a contact field        ▾ ]
[ {{gdpr_consent}}              ]
Accepted values: "granted" or
"denied" (any case). …
Ad personalization
Whether the contact agreed to …
[ Not provided                ▾ ]
⚠ Not sent with the legacy upload
  method …
[            Save              ]
```

States: **not connected** — editable, muted "Applies to conversions once a Google Ads
account is connected."; **absent** — Not provided, Save disabled until dirty;
**invalid stored** — destructive alert "Saved consent settings couldn't be read. Steps
that send conversions fail until you save new settings.", form at Not provided, **Save
enabled while pristine**; **saving** — spinner, controls disabled; **saved** — toast,
`form.reset(saved)` (template editor syncs via §7.0), `useInvalidateGoogleAds()` +
`router.refresh()` (invariant 21); **error** — toast, values kept; **support session /
non super admin** — refused by `assertCanManageGoogleAds`; **disconnect dialog** —
unchanged.

Form plumbing — one shape end to end: form values, `zodResolver`, the action's
`.inputSchema()` and `updateConsent` all use `googleAdsConsentSchema`
(`{ adUserData, adPersonalization }`); the service wraps it into the versioned document.
`useHookFormAction(updateGoogleAdsConsentAction.bind(null, workspaceId), zodResolver(googleAdsConsentSchema), { formProps: { mode: "onBlur" } })`
(invariant 4; workspace id via `bindArgsSchemas` only).

### 7.3 Event history

Output contract `features/integration-google-ads/schema/events.ts`
(`googleAdsEventResource`, oRPC output) gains:

```ts
identity: z.object({ mode: z.enum(["click", "id"]), id: z.string().nullable() }).nullable(),
conversionTimeProvided: z.boolean(),
consentSnapshot: z.object({
  delivery: z.enum(["sent", "toSend", "notSent", "unknown"]),
  adUserData: z.enum(["granted", "denied", "notProvided", "notSupported"]),
  adPersonalization: z.enum(["granted", "denied", "notProvided", "notSupported"]),
}).nullable(),
```

`lib/to-event-resource.ts`: `delivery` = `sent` for `sent`/`processed`/`failed`
(stage processing/timeout); `toSend` for `pending`/`sending`; `notSent` for
`skipped_*`; `unknown` for `failed` at stage delivery. Legacy + adPersonalization →
`notSupported`. The business list query selects `options`.

```
Status     Conversion action  Dedup           Click ID   Occurred          Consent snapshot      ⋯
Processed  Purchase           ID: A-1042      Cj0K…x9A   2 h ago           Data: Granted
                                                         ⏱ Provided time   Pers.: Not supported
Pending    Purchase           ID: A-1043      Cj0K…7Pq   5 min ago         To send · Data: Denied
Skipped    Lead               Per click       EAIa…0Qc   95 d ago          Not sent
Failed     Lead               Per click       EAIa…1Zz   1 d ago           —                 Retry
```

"Dedup" column: "Per click" / "ID: {id}" (truncated to 16 chars with full value in a
tooltip); "—" for `options = null`. Table scrolls horizontally at 375 px.

### 7.4 i18n keys (en; all 21 locales; `pnpm --filter builder i18n:check`)

```
googleAds.conversionFields.dedupMode                  "Avoid duplicate conversions"
googleAds.conversionFields.dedupModeClick             "Once per ad click"
googleAds.conversionFields.dedupModeClickHelp         "Counts this conversion action once for each ad click."
googleAds.conversionFields.dedupModeId                "Once per order or event ID"
googleAds.conversionFields.dedupId                    "Order or event ID"
googleAds.conversionFields.dedupIdPlaceholder         "e.g. '{{order_number}}'"
googleAds.conversionFields.dedupIdHelp                "Reuse the same ID for retries and imports. Use a different ID for each purchase or event."
googleAds.conversionFields.dedupIdExample             "No order ID in chat sales? Combine the contact with a field you set per sale, e.g. {example}. Don't use the current time: it changes on every run."
googleAds.conversionFields.dedupLeadIdNote            "Each different ID counts as a new lead from the same click."
googleAds.conversionFields.dedupClickNote             "Repeat purchases from the same click won't be counted."
googleAds.conversionFields.dedupLegacyNote            "With the legacy upload method Google receives a scrambled version of this ID, not the ID itself."
googleAds.conversionFields.additionalOptions          "Additional options"
googleAds.conversionFields.additionalOptionsCount     "{count} set"
googleAds.conversionFields.conversionTime             "Conversion time"
googleAds.conversionFields.conversionTimePlaceholder  "Leave blank to use the time this step runs"
googleAds.conversionFields.conversionTimeHelp         "Otherwise a date with a timezone, e.g. 2026-10-08T14:30:00+07:00. Can't be in the future."
googleAds.conversionFields.validation.dedupIdRequired "Enter an order or event ID, or choose Once per ad click."
googleAds.conversionFields.validation.dedupIdTooLong  "Use 64 characters or fewer."
googleAds.conversionFields.validation.timeFormat      "Use a date with a timezone, e.g. 2026-10-08T14:30:00+07:00."
googleAds.conversionFields.validation.timeInvalidDate "This date doesn't exist."
googleAds.conversionFields.validation.currencyRequired "Add a currency when you set a value."
googleAds.conversionFields.validation.valueRequired   "Add a value when you set a currency."
googleAds.conversionFields.consentSummary             "Consent: ad user data – {adUserData} · ad personalization – {adPersonalization}."
googleAds.conversionFields.consentNone                "Consent: not provided. ChatbotX omits consent from the upload."
googleAds.conversionFields.consentLegacyNote          "Ad personalization isn't sent with the legacy upload method."
googleAds.conversionFields.consentInvalid             "Consent settings can't be read, so this step will fail."
googleAds.conversionFields.consentLink                "Change in settings"
googleAds.conversionFields.consentFixLink             "Fix them in settings"
googleAds.summary.dedupClick                          "Once per ad click"
googleAds.summary.dedupId                             "ID: {id}"
googleAds.consent.title                               "Conversion data consent"
googleAds.consent.description                         "Tell Google whether your contacts agreed to share their data for ads. Applies to every conversion this workspace sends."
googleAds.consent.learnMore                           "Learn more"
googleAds.consent.notConnected                        "Applies to conversions once a Google Ads account is connected."
googleAds.consent.adUserData.label                    "Ad user data"
googleAds.consent.adUserData.description              "Whether the contact agreed that their data may be sent to Google for advertising."
googleAds.consent.adPersonalization.label             "Ad personalization"
googleAds.consent.adPersonalization.description       "Whether the contact agreed to personalized ads."
googleAds.consent.source.notProvided                  "Not provided"
googleAds.consent.source.granted                      "Always granted"
googleAds.consent.source.denied                       "Always denied"
googleAds.consent.source.variable                     "From a contact field"
googleAds.consent.help.notProvided                    "ChatbotX leaves this consent field out of the upload, so Google applies the default consent setting of your Google Ads account or data connection. If that default is \"not consented\", Google won't record these conversions."
googleAds.consent.help.granted                        "Every conversion says the contact agreed. Only use this if you collect consent before the chat."
googleAds.consent.help.denied                         "Every conversion says the contact did not agree. Google won't record conversions whose ad user data consent is denied."
googleAds.consent.help.variable                       "Accepted values: \"{granted}\" or \"{denied}\" (any case). An empty field is not sent; any other value fails the step."
googleAds.consent.templateLabel                       "{setting} contact field"
googleAds.consent.templatePlaceholder                 "e.g. '{{gdpr_consent}}'"
googleAds.consent.validation.templateRequired         "Insert a contact field, e.g. '{{gdpr_consent}}'."
googleAds.consent.validation.templateTooLong          "Use 200 characters or fewer."
googleAds.consent.legacy.title                        "Not sent with the legacy upload method"
googleAds.consent.legacy.body                         "Google's legacy upload API only accepts ad user data consent. Your choice is saved, but Google won't receive it until this workspace is reconnected with Data Manager."
googleAds.consent.invalidStored                       "Saved consent settings couldn't be read. Steps that send conversions fail until you save new settings."
googleAds.consent.save                                "Save"
googleAds.consent.saved                               "Consent settings saved"
googleAds.consent.summary.notProvided                 "not provided"
googleAds.consent.summary.granted                     "always granted"
googleAds.consent.summary.denied                      "always denied"
googleAds.consent.summary.variable                    "from {template}"
googleAds.validate.consentIncluded                    "Includes consent: {values}."
googleAds.validate.consentNone                        "No consent is included in this test."
googleAds.validate.consentVariableSkipped             "Consent from a contact field can't be tested and is left out."
googleAds.validate.consentNotSentLegacy               "Ad personalization ({status}) is not sent with the legacy upload method."
googleAds.events.columns.dedup                        "Dedup"
googleAds.events.dedup.click                          "Per click"
googleAds.events.dedup.id                             "ID: {id}"
googleAds.events.columns.consent                      "Consent snapshot"
googleAds.events.timeProvided                         "Provided time"
googleAds.events.timeProvidedTooltip                  "This conversion time came from the step, not from when it ran."
googleAds.events.consent.adUserDataShort              "Data: {status}"
googleAds.events.consent.adPersonalizationShort       "Pers.: {status}"
googleAds.events.consent.adUserDataFull               "Ad user data: {status}"
googleAds.events.consent.adPersonalizationFull        "Ad personalization: {status}"
googleAds.events.consent.status.granted               "Granted"
googleAds.events.consent.status.denied                "Denied"
googleAds.events.consent.status.notProvided           "Not provided"
googleAds.events.consent.status.notSupported          "Not supported (legacy upload)"
googleAds.events.consent.delivery.toSend              "To send"
googleAds.events.consent.delivery.notSent             "Not sent"
googleAds.events.consent.delivery.unknown             "Not confirmed"
googleAds.stepErrors.google_ads_unsupported_channel   "This contact's channel can't send Google Ads conversions."
googleAds.stepErrors.google_ads_no_click              "The contact didn't arrive from a Google ad click."
googleAds.stepErrors.google_ads_no_account            "No ready Google Ads account is connected."
googleAds.stepErrors.google_ads_unknown_conversion_action "The conversion action no longer exists. Sync and pick another one."
googleAds.stepErrors.google_ads_action_disabled       "The conversion action is not enabled in Google Ads."
googleAds.stepErrors.google_ads_incompatible_action   "This action counts one conversion per click, which Google doesn't allow for this iOS click."
googleAds.stepErrors.google_ads_unsupported_action    "This action uses external attribution, which can't receive these conversions."
googleAds.stepErrors.google_ads_invalid_value         "The value or currency was not valid."
googleAds.stepErrors.google_ads_invalid_input         "The step's settings were not valid."
googleAds.stepErrors.google_ads_record_failed         "The conversion couldn't be saved."
googleAds.stepErrors.google_ads_missing_dedup_id      "The order or event ID was empty."
googleAds.stepErrors.google_ads_invalid_dedup_id      "The order or event ID was longer than 64 characters."
googleAds.stepErrors.google_ads_invalid_consent_config "Saved consent settings couldn't be read."
googleAds.stepErrors.google_ads_invalid_consent_value "A consent field held a value other than \"granted\" or \"denied\"."
googleAds.stepErrors.google_ads_invalid_conversion_time "The conversion time was not a valid date with a timezone, or was in the future."
```

**ICU escaping.** Message strings are ICU (next-intl): a literal `{{…}}` inside a
message must be quoted as `'{{order_number}}'` (as `en.json` already does for
`'{{total_tagged}}'`, `'{{prize_name}}'`), or the message fails to parse at render.
Values passed as parameters (`{example}`, `{template}`) need no quoting. The three
keys above with a literal placeholder are written quoted; `dedupIdExample` receives
the example as a parameter.

Keys to delete in P8: `googleAds.summary.orderId`. The Google fields use no
`metaConversions.fields.orderId*` keys (Meta keeps them).

### 7.5 Error code translation (Q7)

`googleAdsConversionErrorCodes` moves to `@chatbotx.io/utils/google-click`. The worker
writes these rows through `reportGoogleAdsInputFailure` → `logProviderError({ provider:
"google-ads" })` (`packages/business/src/error-log/service.ts`); the `ErrorLog` table has
no `provider` column, so P10 first confirms which column carries that value (expected:
`action`) and which carries the message (`detail`), and pins both in the test. The Error
Log table (`apps/builder/src/features/error-logs/error-logs-table-columns.tsx`) renders,
for Google Ads rows whose first `detail` line is a known code, the
translated `googleAds.stepErrors.{code}` followed by the remaining detail lines. Detail
lines are one `<path>: <message>` line per zod issue, then `Resolved: …` / `Setting: …` /
`Trigger: …`; the builder translates the first line (the code) and also any
`<path>: <googleAds.… key>` line when `t.has(key)` is true; other text is untouched. An
exhaustive `Record<GoogleAdsConversionErrorCode, key>` makes a new code a compile error.
Flow step `errorMessage` stays the stable code (no builder surface renders step error
messages today; see §13).

## 8. Scenarios and recommended setup

| Scenario | Setup | Result |
|---|---|---|
| Lead → qualified → purchase from one click | Three conversion actions (e.g. Submit lead form, Qualified lead, Purchase); lead/qualified "Once per ad click", purchase "Once per order or event ID" | One of each per click; actions never collide (identity is per action) |
| Repeat purchases from one click | Purchase action, ID mode, ID = real order number | One conversion per order |
| Chat sales without an order system | ID mode, ID = `{{user_id}}-{{order_number}}` where `order_number` is a contact field the agent/flow sets per sale | One per sale; reusing the field value dedups |
| CRM back-dating / imports | ID mode with the CRM's deal id + Conversion time = the CRM close time | Re-imports dedup on the deal id; time never changes identity |
| Retries, duplicate webhooks, flow reruns | Either mode | Same click (click mode) or same ID (ID mode) → one event; the first snapshot wins |
| Several genuine leads on one click | Lead action switched to "Once per order or event ID" with a per-lead ID (e.g. a form submission id field) | One per distinct ID; the UI shows `dedupLeadIdNote` |
| Missing ID at run time | — | Flow step error branch / trigger Error Log; nothing sent |

Admin help doc outline (`docs/` page later linked from the field's help; content written
in P10): (1) What "Avoid duplicate conversions" does; (2) Choose "Once per ad click" for
leads, sign-ups, bookings; (3) Choose "Once per order or event ID" for purchases and
anything that can happen more than once; what makes a good ID (stable across retries,
unique per purchase, ≤ 64 chars) and what never to use (current time, random values);
(4) Funnels: one conversion action per stage; (5) Imports and back-dating with
Conversion time, incl. "give each order its own time: Google drops a second conversion
with the same click and the same time"; (6) What happens when the ID is missing;
(7) Consent settings, "Not provided" (account default) and why "denied" conversions
are not recorded; (8) Legacy upload method differences.

## 9. Work breakdown (tests first; nothing committed)

Commands; TC = the phase's typecheck set, all green at phase end:

```bash
pnpm exec biome check <files>       # pnpm fix if needed; pnpm lint at the end
NODE_OPTIONS=--max-old-space-size=12288 pnpm --filter <ws> check-types   # each ws in TC
pnpm --filter <ws> test
pnpm --filter @chatbotx.io/database db:check-drift
pnpm --filter builder i18n:check    # phases that add keys
```

Workspaces: `@chatbotx.io/utils`, `@chatbotx.io/database`, `@chatbotx.io/flow-config`,
`@chatbotx.io/business`, `@chatbotx.io/integration-google-ads`, `worker`, `builder`.

**P1 — Partials, settings table, migration.** Tests: settings document v1, unknown
version, variable without placeholder, options v1 (identity block, `id` ≤ 64); utils
RFC3339 table; `google-ads-settings` repository (upsert, find, workspace A's row never
read/updated for B). Files: partials, `google-ads-settings.ts` schema + relations (two
edits) + repository, event schema (`options` added but optional in the insert type,
CHECK dropped; `orderId` column **kept** until P4). No migration is generated yet: the
ONE migration is generated in P4 once the schema is final (§3.3); `db:check-drift` is
expected to fail between P1 and P4 and is run at the end of P4. TC: utils, database, business, worker, builder.

**P2 — Timing + lifecycle.** Tests: §6. Code to change: make
`isConversionExpired` (`timing.ts`) match §6 rules A/B (no `min(90 d, lookback)` on
delivery − receipt, no conversion-age rule) and update its tests; docs lines ~546–549
and ~609 of `docs/google-ads-conversion-tracking.md` follow in P10. Files: `timing.ts`,
`delivery.ts` comments. TC: business, worker.

**P3 — Consent service.** Tests: `getConsent` (absent/ok/invalid, scoped),
`updateConsent` (wraps v1, scoped, parse failure refused), `toConsentInput` table
(`Granted`, ` DENIED `, `""`, unresolved `{{…}}` → omitted; `yes` → `ok:false`).
Files: `google-ads-settings/service.ts`, `consent.ts`, exports. TC: business.

**P4 — Identity + record contract + producers + flow-config (one phase).** Everything
that changes the record input or the step fields lands together: flow-config fields
(`dedupMode`, `dedupId`, `conversionTime`, superRefine), builder
trigger default, minimal mechanical rename in `google-ads-conversion-fields.tsx` and
`lib/conversion-summary.ts` (full UI in P8), `buildTransactionId` per §4.4, `schema.ts`,
`record-conversion.ts`, `service.ts`, `options` required in `insertIgnoreDuplicate`,
`orderId` column dropped from the schema and the ONE migration generated now (§3.3),
`resolve-conversion-inputs.ts`, step handler, action executor, error codes moved to
utils. Code to delete: the flow-config `orderId` field; the step handler's
occurrence-key helper (message id / flow execution key) and its tests; the
`category`/`scope`/`scopeId`/`contactInboxId`/`triggerMessageId` inputs of
`buildTransactionId` and its no-stable-occurrence warning; the insert clamp in
`record-conversion.ts` (~L243–248); the `orderId` column. Fixtures to update: `packages/business/__tests__/google-ads-record-conversion.test.ts`,
`google-ads-transaction-id.test.ts`, `google-ads-list-events.test.ts`,
`google-ads-owner-schema-service.test.ts`, `apps/worker/__tests__/send-google-ads-conversion-step-handler.test.ts`
(occurrence-key cases deleted), `trigger-action-executor-send-google-ads-conversion.test.ts`,
`action-executor-contact-inbox-attribution.test.ts`,
`packages/database/__tests__/google-ads-conversion-event-repository.test.ts`,
`packages/database/__tests__/integration/google-ads-conversion-event.test.ts`,
`packages/flow-config/__tests__/send-google-ads-conversion.test.ts`,
`integrations/google-ads/__tests__/wire-legacy-upload.test.ts` (transaction-id
fixtures), and the builder files that read `orderId` or `googleAds.summary.orderId`:
`apps/builder/__tests__/google-ads-conversion-summary.test.ts`,
`apps/builder/__tests__/google-ads-conversion-options.test.ts`,
`apps/builder/__tests__/google-ads-conversion-fields.test.tsx`,
`apps/builder/__tests__/trigger-send-google-ads-conversion-schema.test.ts`,
`apps/builder/src/features/flows/react-flow/steps/send-google-ads-conversion/__tests__/steps.test.tsx`,
plus source `apps/builder/src/features/integration-google-ads/lib/conversion-summary.ts`,
`components/google-ads-conversion-fields.tsx`,
`apps/builder/src/features/triggers/components/actions/schema/send-google-ads-conversion.ts`.
Closing search across EVERY workspace before declaring P4 green (quote the globs in
zsh): `grep -rln -e orderId -e triggerMessageId -e googleAds.summary.orderId -e insertIgnoreDuplicate -e recordGoogleAdsConversion apps packages integrations --include='*.ts' --include='*.tsx' | xargs grep -li google`;
every hit is either updated or confirmed unrelated (Meta CAPI / ads-conversion keep
their own `orderId`).
New tests:
- identity: distinct IDs → two events; same ID twice → one; same ID from two
  different steps/triggers → one; same ID on two actions → two; same ID in two
  workspaces on the same conversion action → different provider ids (both rows kept);
  same workspace, same ID after switching the Google Ads account → different provider
  id; same workspace and account, same ID → same provider id; cross-click replay
  (same ID, different click) → one, first click kept; click mode per click+action;
  lead action overridden to ID mode → one per ID; non-lead overridden to click →
  one per click;
- missing / `{{unresolved}}` / blank / 65-char ID → `missingDedupId` /
  `invalidDedupId`; flow step error branch + Error Log; trigger Error Log + warn,
  no row; no fallback to message/job ids;
- conversion time never changes `transactionId` (back-dated replay → same id); gbraid
  + ONE_PER_CLICK still refused in both modes;
- retries / redelivery / reruns → one row, first `options` kept;
- concurrent inserts of one identity → one row (opt-in real-PG `test:db`);
- consent: one resolve call, invalid config / value handling, no raw value in logs,
  `describeGoogleAdsInputFailure` never gets `consent`; record clock tests (§6).
TC: utils, database, flow-config, business, integration-google-ads, worker, builder.

**P5 — Delivery + validate.** Tests: `wire-data-manager.test.ts` (`gads-v2-` id,
consent both/one/none, exact enums), `wire-legacy-upload.test.ts` (hashed `orderId`
from the v2 id, `adUserData` only, never `adPersonalization`, replay byte-identical
across manual retry and redrive), delivery (null options; unknown version → terminal,
no HTTP), `validateIngest` (fixed consent included, variable omitted, invalid refused),
`consentForTransport` table (Data Manager: both sent; legacy: ad personalization
withheld), validate summary: Data Manager fixed granted / denied, Data Manager variable
(`variableSkipped`), legacy + fixed ad personalization → `notSentLegacy` (dialog says
"not sent", never "included"), legacy ad user data → sent; Data Manager duplicate
recovery (§6): `classifyRequestStatus` with only `DUPLICATE_TRANSACTION_ID` /
`DUPLICATE_GCLID` (bare and prefixed) → `duplicate`; mixed with `DENIED_CONSENT` →
failed; housekeeping finishes a duplicate as `processed` with `duplicateRecovery: true`
stored in `processingDetail` (diagnostics only; the history row shows a plain
Processed). Files: `consent.ts`,
`schemas.ts`, `data-manager.ts`, `legacy-upload.ts`, `processing-status.ts`,
`housekeeping.ts`, `delivery.ts`, `integration-google-ads/service.ts`,
`validate-request.action.ts`, `validate-request-dialog.tsx`, locales. TC:
integration-google-ads, business, worker, builder.

**P6 — Consent API surface.** `to-consent-view.ts`; `getIntegration` handler +
resource; `update-consent.action.ts` (input `googleAdsConsentSchema`,
`bindArgsSchemas`, `assertCanManageGoogleAds`); page loader `consent` prop. Tests:
disconnected workspace returns consent; invalid → status invalid; unknown keys
stripped; non super admin / support session refused; payload `workspaceId` rejected;
other workspace not writable; loader with `setup = null`. TC: business, builder.

**P7 — `GoogleAdsTemplateField`.** Tests: blur → validation; with the REAL picker
(rendered by `PlainTextTiptapEditor`, not mocked): open it while the field is focused,
select a variable → no blur validation; a reset issued while focused stays deferred
through further picker use (open / focus an option without choosing) until a real blur
and then applies; a user edit made while a reset is deferred (typing or choosing a
variable) supersedes it — the edit is written to the form and the deferred reset is
dropped; an external value that returns to the last emitted text while deferred cancels
the deferral; focus from the picker to an outside button → one
blur; ARIA on `contenteditable`; role/name queries; reset unfocused / focused (on
blur); typing never re-sets; echo ignored; existing host DOM unchanged without the two
props (snapshot). Files: `google-ads-template-field.tsx`, `TranslatedFieldMessage`,
`plain-text-tiptap-editor.tsx` (`editorAttributes`, `inlineVariablePicker`). TC: builder.

**P8 — Step/trigger UI.** Tests: dedup radio below the action; default by category on
a new step; a saved step keeps its mode on mount and on action change; choose click,
back to id, then change to a lead action → mode stays `id`; a programmatic default never
marks the mode explicit; a category change and a `form.reset` update the VISIBLE
checked radio (assert `aria-checked` / `checked` on both items); a user click marks the
mode explicit, a programmatic default does not; a saved step mounts explicit with its
saved value checked; arrow-key navigation selects and fires the user callback; the group
is found by role `radiogroup` with name "Avoid duplicate conversions"; ID field only in ID mode, value kept across
toggles, required error; override notes; legacy note; disclosure holds only
Conversion time (opens on mount with a value or error; opens on a new error after
submit; can be collapsed with a value → "· 1 set"); consent summary variants; translated errors;
`steps.test.tsx` round trip; node summary. Files: `google-ads-conversion-fields.tsx`
`google-ads-dedup-mode-field.tsx`, both editors, `conversion-summary.ts`, locales. Browser (lead, Chrome,
1440/375): purchase vs lead defaults; override both ways; empty ID → error on blur;
keyboard radio navigation; disclosure; consent link; the variable picker inside the
step dialog is not clipped and is usable at 375 px. TC: builder.

**P9 — Settings UI.** Tests: `google-ads-consent-section.test.tsx` (absent; each
source; variable input; legacy warning; not connected; invalid → Save enabled →
recovery; reset after save updates the visible source selects and the template
editor; switching a source from "From a contact field" to another value and saving
stores no `template`; Tab order; accessible names).
Files: consent components, `google-ads-settings.tsx`, locales. Browser (1440/375,
light/dark): sources, invalid template, save/reload, disconnect → values kept →
reconnect, legacy warning, keyboard-only, screen reader helper text. TC: builder.

**P10 — History, error-code translation, docs, review.** Tests: `schema/events.ts`
output wire test (`identity`, `conversionTimeProvided`, `consentSnapshot`; unknown keys
stripped), `to-event-resource` mapping per status, `google-ads-events-history.test.tsx`
(Dedup column, provided time, consent states), Error Log translation (known code →
translated + detail lines; unknown text unchanged). Files: list query, `events.ts`,
`to-event-resource.ts`, `events-table.tsx`, `error-logs-table-columns.tsx`, locales.
Docs: `docs/google-ads-conversion-tracking.md` (identity per §4.4, consent,
conversion time, advisory timing, Learn-more source) and the admin help page (§8
outline); this plan's As-built. Then `pnpm lint`, invariant-guard, review.
TC: utils, business, builder.

## 10. Rollout

1. Owner applies the migration (new table, `options`, drop `orderId`, drop CHECK).
2. Deploy `apps/worker` first (producers and delivery ship together; delivery tolerates
   `options = null`). Unreleased feature, so rolling-deploy mixing is acceptable.
3. Then builder. No backfill; older dev rows show "—".

## 11. Risks

**Verified against Google's docs (2026-10-07):** Data Manager consent enums
`CONSENT_GRANTED` / `CONSENT_DENIED`; `eventSource` includes `MESSAGE`; `transactionId`
optional and scoped per conversion action; legacy `order_id` "one conversion per
conversion action"; legacy `Consent.ad_personalization` "can only be set for
OfflineUserDataJobService and UserDataService" (so §5.2 withholds it); legacy
`conversion_date_time` "must be after the click time", timezone required; `TOO_RECENT_EVENT`
= click less than 6 h ago; `EXPIRED_EVENT` = click before the click-through window
(1–90 d for most action types, 1–60 d for call types); conversions uploaded more than
90 d after the click are not imported (rule A); the Data Manager reason names in §6;
transaction ID limit of 64 characters (help 6386790); omitted consent → the account /
connection default, and a denied or defaulted-denied ad user data → `DENIED_CONSENT`.

**Still unverified (named constants, no UI promises):** the numeric "max supported
age" behind `EVENT_TOO_OLD` and any future-timestamp tolerance (we reject the future
locally, Q4); whether the 64-character limit in the tag/import help also binds the Data
Manager `transactionId` (ours is ≤ 59 either way); the 63-day enhanced-leads limit (not
used); whether tiptap v3 `setContent` emits an update (handled either way).

**`DUPLICATE_GCLID` edge:** Google also rejects a second conversion with the same gclid
*and the same conversion time*. In `id` mode two distinct orders on one click normally
differ in time (`recordedAt` is per run), but a provided Conversion time copied from a
CRM field with an identical timestamp (e.g. every order at `T00:00:00`) can make them
equal; the second order is then dropped by Google with `DUPLICATE_GCLID`: on Data Manager it
finishes as Processed (duplicate recovery; the flag is not rendered), on the legacy
upload method a first-attempt duplicate is `failed(delivery)` and only a replay of an
already-sent event is recovered. Documented in the admin
help (§8 item 5), not guarded locally.

**Other risks:** a required ID makes misconfigured purchase steps fail visibly (intended);
"Always granted" is the workspace's legal statement; failing on unrecognized consent
values; `editorAttributes` is the only shared-editor change; legacy ad personalization
configured but not sent (visible in three places).

**Known edges, accepted.** (1) Field errors on the cross-field rules (ID required or too
long, value without currency) appear once every static field is valid: a static field
that fails its own format check (e.g. a malformed Conversion time) aborts the parse
before the object refinement runs, so the ID error shows on the next save. (2) In `id`
mode a static ID containing a literal `{{` that is not a placeholder (e.g. `ord{{1`)
passes static validation; at run time any `{{` is treated as unresolved, so the step
takes its error branch with `google_ads_missing_dedup_id` on every run (visible, no
fallback, D3).

## 12. Deferred and open questions

Deferred: "Each new event" mode and trigger occurrence keys (D5, Q8); adjustments,
refunds and the other §1 non-goals. Open questions: none blocking.

## 13. As-built

State at the end of P10: everything below is implemented, unit-tested and type-checked.
**Nothing is browser-verified and nothing ran against Postgres**, because the
the merged `add_google_ads_conversions` migration is generated but unapplied
(owner applies it). Browser items are listed at the end of this section.

**P1 Partials, settings table.** `partials/google-ads.ts` (consent source/document
v1, `NOT_PROVIDED_CONSENT`, event `options` v1), `schema/google-ads-settings.ts` +
`relations/google-ads-settings.ts` (both edits in `relations/index.ts`) + repository
`repositories/google-ads-settings/` (upsert/find, always scoped by workspace);
`isRfc3339WithZone` / `parseConversionTime` in `packages/utils/src/google-click.ts`.
The event schema gained `options`; the `occurredAt >= click` CHECK and the `orderId`
column were dropped (column in P4).

**P2 Timing.** `isConversionExpired` implements rules A and B only (delivery −
receipt ≤ 90 d; occurredAt − receipt ≤ lookback, null → 90 d); no conversion-age rule.
Lifecycle clocks (delays, sweeper, redrives) stay on receipt.

**P3 Consent service.** `packages/business/src/google-ads-settings/service.ts`
(`getConsent` absent/ok/invalid, `updateConsent`, no `withCache`) and
`google-ads/consent.ts` (`consentTemplatesOf`, `toConsentInput`, `consentForTransport`).

**P4 Identity, record, producers.** `buildTransactionId` produces the `gads-v2-` ids;
`record-conversion.ts` takes `recordedAt`, `dedupMode`, `dedupId`, `conversionTime`,
`consent` and writes the `options` snapshot (no clamp); refusals `missingDedupId`,
`invalidDedupId`, `invalidConversionTime`. `resolve-conversion-inputs.ts` is the shared
producer helper (one deep resolve). Error codes live in `@chatbotx.io/utils/google-click`.
`orderId` column dropped; the single merged migration is `add_google_ads_conversions`.

**P5 Delivery + validate.** `delivery.ts` parses `options` (null → no consent; unknown
version → terminal `failed(delivery)`), Data Manager and legacy mappers send the
snapshot's consent (legacy: `adUserData` only). `validateIngest` returns
`consentSummary`, `variableSkipped` and the optional `withheldAdPersonalization`.
Data Manager duplicate recovery: `classifyRequestStatus` returns `duplicate`, housekeeping
finishes it as `processed` with `duplicateRecovery: true`. The flag is stored in `processingDetail` only; no builder code
renders it, so the history shows a plain Processed.

**P6 Consent API surface.** `lib/to-consent-view.ts`, `getIntegration` returns
`consent` + `uploadMethod`, `actions/update-consent.action.ts`, `lib/load-settings-page.ts`
loads consent independently of the connection.

**P7 `GoogleAdsTemplateField`** (`components/google-ads-template-field.tsx`, plus
`editorAttributes` / `inlineVariablePicker` on `plain-text-tiptap-editor.tsx`).
Deferred-reset semantics as built: a reset issued while the field is focused is held
until a real blur and then applied; a user edit (typing or choosing a variable) made
meanwhile supersedes it and drops the deferred reset; an external value that returns to
the last emitted text cancels the deferral. `TranslatedFieldMessage` renders i18n-key
validation messages.

**P8 Step/trigger UI.** `google-ads-conversion-fields.tsx` + `google-ads-dedup-mode-field.tsx`
+ `google-ads-consent-line.tsx`. As specified in §7.1: both hosts share the same markup (no
`host` prop); the radio field uses `FormField` / `FormItem` / `FormLabel` (the label has
an id for `aria-labelledby`); the ID field sits **outside** the radio group, directly
below the last option, so arrow keys move only between the two radios; the disclosure
holds only Conversion time.

**P9 Settings UI.** `consent-section.tsx`, `consent-source-field.tsx`, and the page
rewritten into `connection-row`, `conversion-actions-section`, `events-history-section`
etc. (old connect/setup/conversion-actions/events cards deleted; tests renamed to
match). The template editor appears only when the source is "From a contact field" and is
`inert` (read-only) while a save is in flight; its label uses
`googleAds.consent.templateLabel` with the setting name. The consent line in the step form links to this section.

**P10 History, error translation, docs.**
- The business list query needed no change: `googleAdsConversionEventRepository.listByWorkspace`
  uses `select()`, so `options` was already selected. `schema/events.ts` output gained
  `identity`, `conversionTimeProvided`, `consentSnapshot`; `lib/to-event-resource.ts` maps
  them (delivery by status/stage, legacy + ad personalization → `notSupported`, null status
  → `notProvided`, `options` null → `identity`/`consentSnapshot` null).
  `events-table.tsx` gained the Dedup and Consent snapshot columns and the "Provided time"
  marker (cells in `events-table-cells.tsx`; map-based labels in `lib/status.ts`); the
  consent cell is a focusable button whose `aria-label` and tooltip carry the full text.
  The table still scrolls horizontally.
- Error Log translation: the provider is in `ErrorLog.action` and the message in
  `ErrorLog.detail` (pinned by `apps/worker/__tests__/write-error-log.test.ts`, which now
  has a `google-ads` case). `features/error-logs/google-ads-error-detail.ts` holds the
  exhaustive `Record<GoogleAdsConversionErrorCode, key>` and `resolveErrorLogDetail`;
  `error-logs-table-columns.tsx` uses it (tooltip keeps line breaks). Detail lines are one
  `<path>: <message>` line per zod issue, then `Resolved: …` / `Setting: …` /
  `Trigger: …`; the builder translates the first line (the code) and also any
  `<path>: <googleAds.… key>` line when `t.has(key)` is true; other text is untouched. Flow step
  `errorMessage` stays the stable code; confirmed that no builder surface renders step
  error messages today (the only `errorMessage` hits in `apps/builder/src` are unrelated
  forms and alerts).
- Locales: the 28 keys added in P10 (13 `googleAds.events.*` and 15 `googleAds.stepErrors.*`; the 4 `events.consent.*Full` / `status.granted|denied` keys already existed, so 17 events keys in total) exist in all
  21 locales (en, vi hand-written; 19 machine-translated, unreviewed by natives).
- Docs: `docs/google-ads-conversion-tracking.md` updated (identity, consent, conversion
  time, timing rules A/B, duplicate recovery, snapshot, error codes);
  `docs/google-ads-conversion-options-admin-guide.md` is the admin help page (§8
  outline), linked from `AGENTS.md`; the 2026-10-07 plan's C9 carries a superseded note.

**Other as-built facts.** `withheldAdPersonalization` is display-only. Consent loading
never goes through the setup converters. Validate shows contact-field consent as
"can't be tested".

**To verify in a browser once the migration is applied (1440 and 375 px, light/dark):**
history table (Dedup values and tooltip, Provided time marker, consent cell for
sent / to send / not sent / unknown / legacy / old rows, horizontal scroll, keyboard
focus on the tooltip buttons); Error Log row for a `google-ads` failure showing the
translated line plus detail; step form purchase vs lead defaults, override both ways,
empty-ID error on blur, arrow-key radio navigation, the variable picker inside the step
dialog at 375 px; consent section (sources, invalid template, save/reload, disconnect →
values kept → reconnect, legacy warning); a real conversion end to end against a Google
test account (record, upload, duplicate recovery); `db:check-drift` and `test:db` after
the migration.
