# Google Ads conversions: customer matching and customer properties (plan)

Status: **plan, not built.** Written from a code review (Claude + Codex, read-only), Google's
Data Manager docs and the existing Meta CAPI implementation. Nothing here is verified against a
live `validateOnly` call yet; items marked **[unverified]** need that before they are relied on.

Builds on `docs/google-ads-conversion-tracking.md` and
`docs/plans/2026-10-08-google-ads-conversion-options.md` (dedup `click` / `id` / `event`,
consent, conversion time).

## 0. Decisions (owner, 2026-10-08)

| Question | Decision |
|---|---|
| Hash storage | **Recompute at delivery from the contact (like Meta). No hash is persisted.** Differs from the review's recommendation; consequences in section 4 |
| Consent gate | Identifiers are hashed and sent **only when the recorded `adUserData` is granted** |
| Transport | **Data Manager only** at first; legacy shows "not supported" |
| First release | **P0 (privacy fixes) + P1 (email/phone) + P3 (customer properties)**; P2 (event-based Validate) and P4 later |

**Changes made while building P1 (owner request, same day):**
- The "Customer matching" input is the tiptap template field used by Value (not a source
  select), and accepts **one `{{variable}}` only**; a literal e-mail/number is refused so no
  personal data is saved in a flow. The snapshot stores the two variables; the worker resolves
  them against the contact at delivery through an injected resolver, so the "no persisted
  hash" decision is unchanged.
- History states: the record-time status is shown as **"Configured: ..."**. The plan's
  "unavailable" state (a value was missing at delivery) is **not** persisted, because that
  would put a delivery-time flag in the event; an info log (ids only) records it instead.
- A bare international digit string (a WhatsApp `wa_id`) is read as `+<digits>`.

**Changes made while building P3 (owner request, same day):**
- `customerType` / `customerValueBucket` are template-or-fixed fields placed under Value / Currency
  (same tiptap input as Value); fixed values are upper-cased by the schema, `REENGAGED` is not
  offered.
- The snapshot stores the RESOLVED values (not personal data), under `customerProperties`
  with the same status/consent/transport gate as matching; there is no replay-time
  recomputation, so a retry always sends what was recorded.
- `userProperties` is an **event** field, not part of `userData`; no `encoding` is needed.
- A resolved value that is not allowed refuses the conversion (`invalidCustomerProperty`)
  instead of being dropped, so a typo is visible. Blank / unresolved means "not set".

## 1. Goal and scope

Today `events:ingest` carries `destinations`, `eventTimestamp`, `eventSource=MESSAGE`,
`adIdentifiers{gclid|gbraid}`, `transactionId`, `conversionValue`, `currency` and event-level
`consent`. Google's Event object accepts more. This plan adds, in order of value:

| Priority | Field | Decision |
|---|---|---|
| 1 | `userData.userIdentifiers`: hashed **email** and **phone** | Ship, explicit opt-in |
| 2 | `userProperties`: `customerType` (NEW/RETURNING), `customerValueBucket` | Ship next, explicit mapping |
| 3 | `userData` address (given/family name, region, postal) | Defer: needs 4 components, unhashed country/postcode, and Google's own docs disagree on name punctuation |
| 4 | `cartData` | Separate feature: needs real item/SKU/price/quantity (Merchant Center); a chat event cannot supply it |
| 5 | `sessionAttributes`, `landingPageDeviceInfo`, `wbraid` | Separate capture feature: needs genuine web capture upstream |
| 6 | `eventDeviceInfo` (IP, user agent) | Do not add: messaging webhooks do not know the customer's browser |

Not in scope: changing `transactionId` / dedup, the one-conversion-per-click guard, the timing
policy, or the Meta CAPI pipelines.

## 2. What the references say

- **Google formatting rules** (`developers.google.com/data-manager/api/devguides/concepts/formatting`):
  email: lowercase, trim, remove intermediate whitespace, and for gmail.com / googlemail.com
  remove dots and the `+suffix` of the local part; phone: E.164 **including the `+`**;
  then SHA-256, encoded HEX or BASE64. Names: lowercase, trim. `regionCode` and `postalCode`
  are not hashed.
- **Request shape** (`events:ingest` reference): max 2000 events per request; `encoding` is
  required whenever `userData` is sent; `consent` can be request-level, an event-level value
  overrides it (what we already send); `EventSource` includes `MESSAGE`; `userProperties`,
  `cartData`, `customVariables`, `additionalEventParameters` are optional.
- **Limits:** 10 identifiers per `userData`, one email, phone or address per identifier.
  The legacy `uploadClickConversions` accepts 5 email/phone identifiers and no address.
- **Open source:** `googleads/data-manager-php` ships a util library that formats, normalises,
  hashes and hex-encodes email/phone (`processEmailAddress`, `processPhoneNumber`) and an
  `ingest_events` sample; Google Megalista dedups uploads before sending (see the dedup
  discussion). We follow Google's published rules rather than a copy of either library.
- **Meta CAPI in this repo** (`packages/business/src/meta-conversions/hash-user-data.ts`):
  reads `Contact.email/phoneNumber/firstName/lastName`, validates email with a regex,
  parses phone with `libphonenumber-js` and keeps it only when `isValid()`, hashes with
  `sha256Hex`. It hashes **at delivery time** and never snapshots the hashes. Reusable: the
  parse/validate approach and `sha256Hex`. **Not** reusable as is: Meta drops the `+` from the
  phone, strips internal whitespace and punctuation from names and does not do Gmail
  canonicalisation. Google needs its own normaliser (new `google-ads/hash-user-data.ts`).
- **Gap in Meta's safeguards:** no per-contact consent gate, and Meta's sanitizer can keep a
  provider-echoed value. Google needs stronger handling (section 4).

## 3. Design

**Snapshot holds the configuration, not the identifiers.** Configuration stores *references*
(built-in contact field or contact custom field), never literal values, so a flow can never
contain a raw email. At `record()` time the business layer validates the references, applies
the consent gate and writes a **v2 `options` snapshot** next to identity / time / consent:
matching enabled flag, the email and phone field references, normalisation version, and the
*resolved customer properties* (these are advertiser assessments, not personal data).
At **delivery** the worker/business layer loads the contact scoped to the event's workspace
(and the contact inbox it was recorded for), resolves the referenced fields, normalises and
hashes them, and builds `userData` for the wire. Nothing raw or hashed is written to the event
row, logs, errors, jobs or API responses. v1 and `null` rows replay the old payload unchanged.

Wire mapping (Data Manager): per event `userData.userIdentifiers[{emailAddress}|{phoneNumber}]`
and `userProperties`; request-level `encoding: "HEX"` only when identifiers exist. Validate each
digest as exactly 64 hex characters at the integration boundary (runtime, not only types).

`transactionId` is untouched: no identifier, encoding, property or normalisation version enters
it; first insert wins, a duplicate record never enriches or replaces the existing snapshot.

**Transport.** Enrichment is **Data Manager only** at first. On a legacy connection the controls
are disabled and an event records `unsupportedTransport` without storing hashes. Wording: "not
supported by ChatbotX's legacy uploader", not "Google cannot". Legacy email/phone mapping can
follow on demand (5 identifiers, no address).

**Consent rule (identifiers and, by the same gate, properties):**

| Recorded `adUserData` | Hash, store and send? |
|---|---|
| Fixed granted | Yes, when matching is enabled |
| Variable resolving to granted | Yes |
| Fixed or variable denied | No |
| `notProvided` | No (never infer permission from Google's account default) |
| Variable blank or unresolved | No |
| Variable with an invalid non-empty value | Existing behaviour: record nothing |

Click-only conversions keep working for every row above; only the enrichment is withheld.

**Sources of identity.** Prefer `Contact.phoneNumber` / `email`; custom fields are needed for
anything else (no postal-code column exists). A WhatsApp `sourceId` is **not** always a phone
(BSUID/username identities with hidden phones exist, `incomming-message.ts` ~L215): never
prepend `+` to an arbitrary id. Messenger PSIDs are not identifiers for Google. Phones that
`libphonenumber-js` cannot validate are withheld (no regional guessing from workspace locale).
Do not split a comma-separated string into several identifiers; use explicit mappings.

**Customer properties.** Fixed value or a mapped contact field resolving to `NEW`/`RETURNING`
and `HIGH`/`MEDIUM`/`LOW` (Google's reference also has `REENGAGED`; we expose a deliberate
subset). Never infer them from contact age or activity: they are the advertiser's assessment.

## 4. Privacy and retention

Because hashes are recomputed at delivery, **no matching data is persisted** and no retention
window, erasure marker or migration is needed for it. The price of that choice, to document
and accept:

1. **A replay is not byte-identical.** Editing the contact between the first attempt and a
   retry or redrive can change the identifiers sent. The conversion itself is still deduped by
   `transactionId`; only the matching data may differ.
2. **A deleted contact loses matching.** The event's contact link becomes null, so the retry
   sends the click-only conversion (outcome `unavailable`). A contact whose field was cleared
   behaves the same.
3. **Consent is the snapshot taken at record time.** A later withdrawal on the contact is not
   re-read for events already recorded; a fixed workspace setting changed afterwards also does
   not apply to them. Pending events therefore keep the consent they were recorded with.
4. **Cross-workspace safety is mandatory:** the delivery-time load must pass the event's
   workspace and verify the contact/inbox belongs to it (the variable loader queries by id
   alone; do not treat variable resolution as authorisation).
5. Identifiers never appear in history, public API, CLI/MCP, logs, errors, Error Log rows,
   BullMQ payloads or `fieldWarnings`.

**Leak points to fix first (P0):**
`describeGoogleAdsInputFailure` prints `Object.entries(resolved)` (use an explicit allowlist);
record and delivery sanitizers treat only the click id as secret; provider `fieldWarnings` are
serialised as arbitrary JSON and logged (allowlist reason and path only); `redact.ts` does not
know the new values. "No PII in logs" must cover worker logs, Error Log rows, persisted errors,
provider warnings, validation responses and retry exceptions, hashes included.

**P0 decision on this item: left as is.** The access token used at delivery belongs to the
*live* connection, so pairing it with a login account stored on an older connection could fail
where today it works; the plan treats "same destination on replay" as best effort. Documented,
not changed.

**Unrelated bug found while reviewing:** delivery derives `loginAccountId` from the *live*
setup although the event stores `loginCustomerId` (`delivery.ts` ~L424). If "exact same
payload on replay" must include the destination, use the stored value. Fix in P0 or document.

## 5. Phases

| Phase | Scope | Main files | Required checks |
|---|---|---|---|
| **P0 Privacy foundation** | Allowlisted diagnostics, sanitizers, warning handling, optional `loginAccountId` fix (no suppression/retention path: nothing is persisted) | `google-ads-input-error.ts`, integration `lib/sanitize.ts`, `lib/redact.ts`, `exception.ts`, `delivery.ts`, repository | Canary raw values and hashes never appear in logs, errors, warnings, jobs or API responses |
| **P1 Email/phone** | Opt-in "Customer matching" with one email and one phone mapping; normaliser + hasher run at delivery; options v2 (config only); Data Manager mapper; legacy guard; safe history summary ("Configured: ...", "Withheld (no consent)", "Not sent (legacy)"; the "unavailable" state is not persisted, see the changes note above) | flow-config step schema, trigger schema/defaults, shared builder form, both producers, `resolve-conversion-inputs.ts`, new `google-ads/hash-user-data.ts`, `record-conversion.ts`, `partials/google-ads.ts`, `schemas.ts`, `data-manager.ts`, events schema/resource/table, 21 locales | Normalisation vectors (Gmail, `+`, E.164), consent matrix, replay after contact edit/delete behaves as documented in section 4, old rows unchanged, both producers, no cross-workspace reads |
| **P2 Validation and diagnostics** | Event-based Validate on an already recorded snapshot, same mapper as delivery, types/counts only, keep sanitised field warnings, map Data Manager error reasons to translated messages | `validateIngest`, validate action/schema/dialog, error translations, docs | Validation creates no event; same body as delivery; erased events refused; states clearly that `validateOnly` does not prove matching |
| **P3 Customer properties** | Fixed or mapped `customerType` / `customerValueBucket` in the snapshot and wire | shared fields/form/resolver, options v2, mapper, history, locales | Blank/unresolved/invalid values, first-snapshot-wins, replay |
| **P4 On demand** | Several identifiers per event (10 vs legacy 5), legacy email/phone | structured mapping UI, mapper | Stable ordering/dedup, explicit capability behaviour |
| Later | Address, cart adapter, web/session/device capture | | Resolve privacy and documentation gaps, prove the data source exists |

P0, P1 and P3 are the first release (decision above); P0 and P1 are the minimum unit. Do not ship P1 without the history summary: admins
must be able to tell whether matching is configured and why it may not be sent (it cannot say
whether a value existed at delivery, see the changes note above).

Data Manager error reasons to map (terminal unless transient): `INVALID_HEX_ENCODING`,
`INVALID_SHA256_FORMAT`, `TOO_MANY_USER_IDENTIFIERS`, `REQUIRED_FIELD_MISSING`,
`INVALID_ENUM_VALUE`, the `DESTINATION_ACCOUNT_*ENHANCED_CONVERSIONS*` readiness/terms reasons
and `DENIED_CONSENT` / `NO_CONSENT` / `UNKNOWN_CONSENT`. Unknown reasons need a safe fallback.
Business must not import `packages/variables` (it depends on business): resolve in the
producer, normalise and hash in business. Variable loading must be tied to the workspace and
contact/inbox (it queries by id alone today); do not treat resolution as authorisation.

## 6. Test strategy

Extend the existing suites instead of adding parallel harnesses: business (`record-conversion`,
`delivery`, `legacy-delivery`, `consent`, `processing-status`), integration (`wire-data-manager`,
`wire-legacy-upload`, `sanitize`, `exception`), worker (flow/trigger handlers, input-error),
builder (conversion fields, Validate dialog, event resource/history, public API), flow-config
(round trips and defaults), database (options v1/v2).

Critical test: record event A, then edit the contact, delete it and change workspace consent, and
retry/redrive A: edited fields change only the matching data, a deleted contact sends click-only,
consent stays the recorded snapshot, and the `transactionId` never changes. Concurrent duplicate
records keep the first snapshot. Transaction-id fixtures for all three
dedup modes stay unchanged. Before done: targeted tests and type checks, `pnpm lint`,
`i18n:check`, CLI/MCP docs drift, scoped `test:db` if a migration is ever added.

## 7. Manual verification against Google

Use `validateOnly: true` first, then one authorised real upload with a real click, and a
duplicate replay. Cases: `MESSAGE` with gclid and gbraid, HEX identifiers, omitted `encoding`,
malformed digest, identifier limit, each consent state, account terms and readiness for
enhanced conversions, customer properties. Validation alone does not prove attribution or an
improved match rate.

## 8. Open points

- **[unverified]** Acceptance and usefulness of every enrichment field with `eventSource=MESSAGE`.
- **[unverified]** Enhanced-conversion age rules for messaging events; do not change the
  existing timing policy on assumption.
- Address punctuation guidance conflicts inside Google's docs; resolve before supporting it.
- If hashes are ever persisted later, retention and revocation semantics must be decided first.
- Cart item-count and session-string limits were not established.
