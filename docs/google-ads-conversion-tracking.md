# Google Ads conversion tracking (Click-to-Message)

ChatbotX attributes chatbot conversations back to the **Google ad** that started
them — Google "Message Ads" (Search / Performance Max) that open a **WhatsApp** or
**Messenger** chat — and reports downstream outcomes (qualified lead, purchase)
into the advertiser's Google Ads account as **offline click conversions**, so
Google can optimize against what happens inside the chat.

> **Naming.** In this repo **"CTM" already means Meta Click-to-Messenger**
> (`docs/ads-conversion-tracking.md`, `fields.adReferral.ctm`). The Google feature
> is `googleAds*` in code and "Google Ads (Click-to-Message)" in the UI. There are
> no `ctm` identifiers for it. It is also a separate pipeline from the Meta
> `AdsConversion*` / `MetaCapiEvent` tables: nothing here touches them.

Design record: `docs/plans/2026-10-05-google-ads-conversions.md` (decisions D1–D12
are cited below as "plan D*n*"); identity, consent and conversion time follow
`docs/plans/2026-10-08-google-ads-conversion-options.md`. This document describes
the code as implemented. Admin-facing setup advice (which dedup mode to pick,
consent, back-dating) is in `docs/google-ads-conversion-options-admin-guide.md`.

## The model

| Concept | Where | Notes |
|---------|-------|-------|
| Click attribution | `ContactInbox.referral` (`jsonb`, `packages/database/src/schema/contact-inbox.ts`) | Six flat keys, below. No column migration, no new index on `ContactInbox`. |
| Account | `IntegrationGoogleAds` (`packages/database/src/schema/integration-google-ads.ts`) | Connection-engine satellite; **one row per workspace**. The `Connection` row owns connection status; this row owns Google Ads setup state. |
| Conversion event | `GoogleAdsConversionEvent` (`packages/database/src/schema/google-ads-conversion-event.ts`) | One row per conversion to deliver; also the delivery log shown in the UI. |
| Workspace options | `GoogleAdsSettings` (`packages/database/src/schema/google-ads-settings.ts`) | One row per workspace holding the versioned `settings` document (today: conversion data consent). Separate from `IntegrationGoogleAds` so it survives a disconnect. |
| Enums | `packages/database/src/partials/google-ads.ts` (zod values) + `pgEnum`s in the event schema | Six enums, below. |
| Pure helpers | `packages/utils/src/google-click.ts` | Decoder, ref parser, referral builder, lead-like categories, customer-id helpers. No I/O. |
| Provider client | `integrations/google-ads` (`@chatbotx.io/integration-google-ads`) | `Integration` with a Connection-engine `oauth_redirect` strategy, thin `ky` REST clients for the Google Ads API and the Data Manager API. |
| Business | `packages/business/src/google-ads/*`, `packages/business/src/integration-google-ads/*` | Recording, dedup, delivery, polling, housekeeping, setup, owner helper. |
| Worker | `apps/worker/src/integration/handlers/google-ads/*`, `apps/worker/src/schedule/handlers/google-ads-housekeeping.ts` | Thin handlers around the business services. |

### Referral keys

Written by the channel integrations, merged by `contactInboxService.updateTracking`:

| Key | Meaning |
|-----|---------|
| `gclid` | Google click id (non-iOS). |
| `gbraid` | Google click id for iOS (ATT) clicks. Exactly one of `gclid`/`gbraid` per click. |
| `googleCampaignId`, `googleAdGroupId`, `googleAdId` | Numeric ad identifiers from the payload; anything non-numeric is dropped. |
| `googleClickReceivedAt` | ISO time of the **inbound message that carried the id** (the provider's message timestamp, falling back to the clock). It is **not** the time the user clicked the ad. |

The raw decoded payload is never stored. The six keys are the constant
`GOOGLE_CLICK_REFERRAL_KEYS`. Click ids are validated against
`CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{10,512}$/`.

### Enums

`GoogleAdsConversionEvent.channel` is **not** an enum: it is `text` typed as
`ChannelType` (like `ContactInbox.channel`). The supported channels are the single
list `GOOGLE_ADS_CHANNEL_VALUES` in `packages/utils/src/google-click.ts`
(`googleAdsChannels` zod enum; `partials/google-ads.ts` re-exports it). Which
channels may record a conversion is decided at the producer, not the table, so
adding one needs no migration.

| Enum | Values |
|------|--------|
| `googleAdsEventSource` | `flowStep`, `triggerAction` |
| `googleAdsClickIdType` | `gclid`, `gbraid` |
| `googleAdsEventStatus` | `pending`, `sending`, `sent`, `processed`, `failed`, `skipped_no_account`, `skipped_expired` |
| `googleAdsProcessingStatus` | `processing`, `success`, `partial_success`, `failed`, `unknown`, `timed_out` |
| `googleAdsFailureStage` | `delivery`, `processing`, `timeout` |

`IntegrationGoogleAds.setupError` is a text column typed as
`GoogleAdsSetupError`: `conversion_customer_inaccessible`,
`customer_data_terms_not_accepted`, `sync_failed`, `developer_token_missing`.

### Tables

**`IntegrationGoogleAds`** (table name is load-bearing: `makeAuthStore` derives
`"Integration" + PascalCase(integrationType)`):

- `workspaceId`, `integrationId` (FKs, cascade), `auth` jsonb (engine satellite
  convention, see "Security").
- Written by the engine from `candidateToConfig`: `customerId` (10 digits),
  `loginCustomerId` (the manager the user reaches the customer through; `null` =
  direct access), `descriptiveName`, `currencyCode`.
- Written by the setup service: `conversionCustomerId`,
  `acceptedCustomerDataTerms`, `conversionActions` (jsonb cache of
  `GoogleAdsConversionActionCacheEntry[]`: `id`, `resourceName`, `name`,
  `category`, `status`, `countingType`, `clickThroughLookbackWindowDays`),
  `conversionActionsSyncedAt`, `setupError`, `setupErrorAt`. `null` means "never
  resolved / never synced", distinct from `false` / `[]`.
- Unique `IntegrationGoogleAds_integrationId_key` and
  `IntegrationGoogleAds_workspaceId_key` (the latter is the engine
  `duplicateConstraint`).
- Readiness is derived, never stored (`deriveReadiness`):
  `Connection.status` in an active state (`connected`/`degraded`) **and**
  `conversionCustomerId` set **and** `conversionActionsSyncedAt` set → `ready`;
  connection not active → `needs_reauth`; otherwise `setup_incomplete`. Note that
  `customer_data_terms_not_accepted` is recorded in `setupError` but does not by
  itself make the account non-ready; Google rejects the upload instead (see the
  processing poller).

**`GoogleAdsConversionEvent`**:

- Account snapshot taken at insert (`customerId`, `loginCustomerId`,
  `conversionCustomerId`) plus `conversionActionId`, `conversionActionName`,
  `conversionActionCategory`, `lookbackWindowDays`; delivery skips when the live
  account differs.
- `channel`, `source`, `scopeId` (flow step id or trigger id), `clickIdType`,
  `clickId`, `googleClickReceivedAt`, `occurredAt`, `value`/`currency`
  (both-or-neither), `transactionId`, `options` (the immutable per-event snapshot,
  below). There is no `orderId` column: the business ID lives in `options.identity`.
- `status`, `attempt` (our generation counter, **not** BullMQ `attemptsMade`),
  `claimToken`/`claimedAt` (lease), `requestId`, `sentAt`, `error`,
  `failureStage`, `processingStatus`, `processingCheckedAt`,
  `processingAttempts`, `nextProcessingCheckAt`, `processingDetail`
  (allow-listed subset of Data Manager's `requestStatus`).
- `integrationGoogleAdsId` and `contactInboxId` are `ON DELETE SET NULL`:
  history survives a disconnect and a contact deletion.
- Unique `GoogleAdsConversionEvent_workspaceId_transactionId_key` is the dedup
  mechanism. CHECK constraints pin the state machine (`sent`/`processed` require
  `requestId` and `sentAt`; `sending` requires a claim; `failureStage` only on
  `failed`; value/currency together; click id length 10–512; counters
  non-negative). There is no `occurredAt >= googleClickReceivedAt` CHECK: a
  provided conversion time is stored as given (see "Conversion time").
- **`options`** (`googleAdsEventOptionsSchema`, versioned jsonb, NOT NULL for new
  rows; rows from before it show "—" in the history): `identity` (`configuredPolicy`
  / `effectivePolicy` = `click` | `id`, `keySource`, the resolved business `id` in
  `id` mode), `timeSource` (`recorded` | `provided`) and `consent` (per setting:
  `status` `granted` | `denied` | `null` = omitted, `source` `notProvided` | `fixed`
  | `variable`). It is written once at insert and never changes: replays, manual
  retries and redrives send exactly the same identity, time and consent, and a
  duplicate record keeps the first snapshot. Templates and the raw resolved consent
  text are never stored.
- **Retention:** the click id stays on the event row after the contact or inbox
  is deleted (the FK is set to null, the row is kept). No automatic purge exists;
  the workspace cascade delete removes the rows. Define a retention policy before
  relying on this for privacy requests.

## Capture formats

Exactly one of `gclid`/`gbraid` per click. Both channels use the one-call helpers
in `packages/utils/src/google-click.ts` (`consumeGoogleClickRef`,
`extractInvisibleGoogleClick`), which build the referral with
`toGoogleClickReferral`, so the shape is identical.

### WhatsApp (invisible Unicode in the starter message)

`integrations/whatsapp/src/handlers/message/incomming-message.ts`,
`decodeInvisibleGoogleClick` in `packages/utils/src/google-click.ts`.

- Alphabet: the 70 characters
  `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_{}'",:-`,
  character *i* mapped to code point `U+E0100 + i` (Variation Selector
  Supplement, `U+E0100`..`U+E0145`).
- A run of those code points decodes to JSON:
  `{"gclid"|"gbraid":"<id>","campaignid":123,"adgroupid":456,"adid":789}`. The run
  may be at the start of or inside the text.
- All maximal runs are found with one regex scan (text with no such code points
  costs one scan and nothing else). Google's reference decoder joins every invisible
  character of the whole message (the payload may sit at the start or be spread
  inside the text), so the join of all runs is tried first; if it is not a valid
  payload, each run is tried alone, **longest first**, and the first valid one wins.
- Only the runs that decoded to the payload are stripped from the stored text (`stripConsumedRuns`).
  Any other invisible character, e.g. ideographic variation selectors in Japanese
  text, is left untouched, and text with no valid payload is never altered.
- The `/ref-` reflink check runs on the stripped text, so a Google-tagged
  `/ref-…` message still routes.
- `googleClickReceivedAt` = the WhatsApp message `timestamp` (Unix seconds),
  else the current time.

### Messenger (structured `ref`)

`integrations/messenger/src/handlers/message/incoming-message.ts`,
`parseGoogleClickRef`.

- `m.me/<page>?ref=gclid:<id>,campaignid:1,adgroupid:2,adid:3` or
  `ref=gbraid:<id>,…` (URL-decoded, keys case-insensitive, first occurrence of a
  key wins, a pair needs a non-empty key before the first `:`).
- When a Google click is parsed the `ref` is **consumed**: `ref` is set to
  `null` and removed from the stored `raw` referral so the click id is not kept
  verbatim and the ChatbotX ref router never looks it up (no `runRef` job).
- `googleClickReceivedAt` = the Messenger messaging timestamp.
- The legacy raw `ref=<gclid>` form (no `gclid:` prefix) is **not** supported.

### Contact source

`received-message.ts` (`resolveContactSource`) checks for a Google click
**first** and sets `Contact.source = ads`; an `m.me?ref=` link also arrives as a
Meta `SHORTLINK` referral, which would otherwise map to `botLink`.

## Adding a channel

A channel needs **one list value plus its own capture wiring**: no DB migration,
no builder or i18n edit (event history labels reuse the app-wide inbox label).
Everything after capture (persistence on `ContactInbox.referral`, contact source,
badge, filter, flow step, trigger action, delivery) is channel-agnostic. The
capture wiring is the part that is specific to each channel:

- **Instagram:** one capture call in each of `integrations/instagram` and
  `integrations/instagram-facebook` (both parse referrals), consuming the ref and
  stripping it from the stored raw referral exactly as Messenger does.
- **Telegram:** the handler does not produce a `referral` today; it must start
  returning one built from the `/start` parameter (64 characters, `[A-Za-z0-9_-]`
  only, so the `gclid:<id>` format needs a new compact encoding first).
- **Zalo:** the carrier field is unverified (spike not performed); the webhook
  schema and the message handler must be extended once it is known.
- **Webchat:** capture belongs in the builder's guest-message path
  (`create-webchat-message.action.ts`), reading `gclid`/`gbraid` from the landing
  URL on the client; the value is browser-supplied, so it needs server-side
  validation and a trust decision.

1. Add the `ChannelType` value to `GOOGLE_ADS_CHANNEL_VALUES` in
   `packages/utils/src/google-click.ts`. The DB column (`text`), the API filter,
   the `recordGoogleAdsConversion` gate (`unsupportedChannel` outcome) and the
   badge all derive from it.
2. In that channel's incoming-message handler, call the helper that matches its
   carrier and merge the returned `googleReferral` into the message `referral`
   (`contactInboxService.updateTracking` persists it):
   - structured ref or start parameter: `consumeGoogleClickRef(ref, receivedAt)`
     returns `{ ref, googleReferral }`;
   - hidden in the message text: `extractInvisibleGoogleClick(text, receivedAt)`
     returns `{ text, googleReferral }` with only the consumed run stripped.
3. Make sure the parsed ref is **consumed**: use the returned `ref` (it is `null`
   when a Google click was parsed) so the reflink router never looks the click id
   up as a ChatbotX reflink. Strip any raw copy of it from stored `raw` payloads
   (Messenger keeps its raw-without-ref stripping local).
4. Add a capture test beside the channel's existing ones (see
   `integrations/whatsapp/__tests__/google-click-capture.test.ts`).

Channel notes:

- **Telegram:** the carrier would be the deep-link `start` parameter, limited to
  64 characters of `[A-Za-z0-9_-]`. A `gclid:<id>,...` ref contains `:` and `,`
  and usually exceeds 64 characters, so it needs an encoding/short-token scheme
  before it can be used.
- **Webchat:** there is no click-to-message carrier; the widget must read the
  Google click id from a URL parameter on the host page and pass it on session
  start.
- **Zalo:** the carrier is unverified (see the Zalo spike below).

## Attribution policy

Merged in `contactInboxService.updateTracking` with
`COALESCE(referral, '{}') || <compactReferral(referral)>` (jsonb `||`):

- **Per provider family.** A newer Google click overwrites older Google keys.
  Because `toGoogleClickReferral` always emits all six keys, a `gbraid` click
  carries `gclid: null` and vice-versa, and `compactReferral` keeps an explicit
  `null` **only for the six Google keys**; this is how the other click id is
  cleared. Every other null is dropped as before.
- **Null-clearing:** campaign/ad-group/ad ids absent from the new payload are
  also set to `null`, so a newer click never inherits ids from an older one.
- Non-Google referrals never clear Google keys; Google never touches Meta keys
  (`source`, `type`, `ctwaClid`, `adId`, …). **Cross-platform double attribution
  (a Meta ad and a Google ad on the same inbox) is accepted.**
- `googleClickReceivedAt` is the message time, so it moves forward with every new
  Google-tagged message; it is the basis of the 6 h gate and the expiry check.
- The predicate used by the filter and by attribution lookups is the single
  `googleClickPredicate()` (`packages/database/src/queries/google-click.ts`):
  `gclid` or `gbraid` is not null. It is deliberately **not** part of the Meta
  `adConversationPredicate` family.

## Connect / OAuth flow

The account is connected through the **Connection engine**
(`packages/connections`; `CONNECTION_REGISTRY.googleAds`, credential type
`googleAds` (its own OAuth app, not the `google` credential), `multiAccount: true`, strategy `oauth_redirect`, satellite
`IntegrationGoogleAds`).

```
Settings "Connect Google Ads" (startGoogleAdsConnectAction)
  → startConnect({provider:"googleAds", redirectUrl: absolute settings URL, ownerId: resolvePlatformOwnerId})
  → Google consent (offline access)
  → /integrations/google-ads/callback  (generic ConnectSession callback)
  → exchangeCode: adds account identity + developer token to the ENCRYPTED session auth
  → listCandidates: accessible customers, expanded through managers
  → session awaiting_selection → callback redirects to the stored return URL (+ ?session=<id>)
  → picker → pickGoogleAdsAccountAction → connectionService.connectTargets
  → Connection{connected, sourceId = customerId} + IntegrationGoogleAds row
  → integrationGoogleAdsService.refreshSetup (conversion customer + conversion actions)
```

- **Scopes depend on the upload method chosen in the platform credential**
  (`requiredScopesFor` / `authorizeScopesFor`): Data Manager asks for
  `https://www.googleapis.com/auth/adwords` and
  `https://www.googleapis.com/auth/datamanager`; legacy asks for `adwords` only (the
  Data Manager scope is never requested). Both add `openid` and `email`.
- **Partial consent is rejected.** Google's consent screen lets the user untick a
  scope, and the Ads API (setup) and Data Manager (delivery) need different ones, so
  a connect with only one would set up fine and then fail every `events:ingest`.
  After the token exchange `addGoogleAdsIdentity` checks that the granted scopes
  (the token response `scope`, else tokeninfo `scopes`) contain **both** `adwords`
  and `datamanager` ([granular permissions](https://developers.google.com/identity/protocols/oauth2/web-server):
  the app "must verify which scopes were actually granted"). A missing one throws
  `ConnectionProviderRejectedError` with failure cause `scope_missing`, which the
  connect flow carries into `?connect_error=scope_missing` (also for an exchange
  failure, not only a listing failure) and the settings page shows as a translated
  "reconnect and tick every permission" alert. `verify` (and so the daily refresh)
  flags an already-stored connection whose recorded `metadata.scope` lacks a
  required scope as revoked (`needs_reauth`); a row with no recorded scope predates
  the check and is left alone.
- **Own platform credential (`googleAds`):** Google Ads does **not** share the
  `google` credential (Sheets / Calendar / sign-in). `googleAdsCredentialSchema` =
  `{ clientId, clientSecret, developerToken?, uploadMethod? }`; the developer token is
  optional (Google ignores it since 2026-09) and an absent method means Data Manager; the public projection
  is `clientId`, `uploadMethod` and `hasDeveloperToken` (never the secrets). The reason is OAuth verification: the sensitive `adwords`
  scope needs its own Google OAuth verification, which must not gate or put at risk
  the other Google features, so Google Ads gets its own OAuth client. It is
  tenant-aware via `platformCredentialService.resolveForOwner`; the admin card is
  Platform credentials → Google Ads (superAdmin, same owner scoping as the other
  cards). The two secrets are write-only: the card shows "set / not set" and a
  blank submission keeps the stored value, a new value replaces it. Deleting the
  card removes all three values.
- **Developer token (optional):** the `developerToken` field of that credential.
  Google sunset developer tokens on 2026-09-09 and ignores the `developer-token`
  header, so it may be blank: it is sent only when present, and "configured"
  needs `clientId` + `clientSecret` only. Where present it rides with the
  advertiser's OAuth token on Google Ads API calls (setup/sync, and the legacy
  upload); the Data Manager delivery, poll and "Validate request" never use it.
  A stale token Google rejects surfaces as `developer_token_not_approved`; the
  fix is to remove it (it is optional) or replace it.
- **The developer token is never written to satellite `auth`.** The satellite
  `auth` jsonb is plaintext like every other engine satellite (see "Security"),
  so the token rides only inside the encrypted `ConnectSession.encryptedAuth`
  during connect (consumed by `listCandidates`, then removed by
  `stripDeveloperToken` from every candidate auth) and is otherwise resolved at
  runtime from the encrypted platform credential
  (`integrationGoogleAdsService.resolveDeveloperToken`, strict resolution of the
  `googleAds` type). `exchangeCode` reads it from `input.credential.developerToken`.
  `integrationGoogleAdsService.isConfigured` needs the client id and client secret
  (the developer token is optional since the 2026-09-09 sunset); if the owner's
  `googleAds` credential is missing or incomplete the settings page shows a "not
  available" state and connect/reconnect refuse with `developerTokenMissing` (409).
- **Redirect URI to register in the Google console:**
  `{origin}/integrations/google-ads/callback` (`OAUTH_CALLBACK_SLUG.googleAds =
  "google-ads"`). It is shown on the Google Ads platform credential card (with a
  reminder to enable the `adwords` and `datamanager` scopes and to get that OAuth
  app verified) and is listed in `docs/tenancy.md`'s registration runbook.
- **Candidates:** every ENABLED, non-manager customer the user can reach: those
  accessible directly (`loginCustomerId = null`), plus the clients of each
  accessible manager (`loginCustomerId` = that manager). A directly reachable
  account wins over the same account listed under a manager. One unreadable
  account never hides the others (a sanitized warning is logged and the partial list
  kept); if **every** lookup fails the first error is thrown rather than returning an
  empty list. A failed manager expansion (or lookup) that is **transient** (a
  `GoogleAdsException` that is retryable, i.e. 408/429/5xx, or a timeout / aborted /
  connection-reset error) while **no** candidate was found is rethrown, so the
  engine reports `connectionProviderUnavailable` (retryable, session kept) instead of
  the terminal `no_candidates`. A permanent failure (403 and so on) with nothing else
  found still yields an empty list. A customer failing with `CUSTOMER_NOT_ENABLED`
  / `CUSTOMER_NOT_FOUND` is an **inactive account** (cancelled, suspended, not fully
  set up): it is skipped with an info log (customer id + reason), never counted as a
  failure, and never turned into a credential/token error; if nothing else remains
  the result is `[]` (`no_candidates`). Google error bodies are read in both shapes,
  `{error}` and the streaming `[{error}]` (first element carrying `error`). A 403
  with no recognisable reason maps to `permission_denied`; only `DEVELOPER_TOKEN_*`
  reasons map to the developer-token causes. `AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`
  (and `ACTION_NOT_PERMITTED` **only** when it is an `authorizationError`, which is what
  API versions before v25 return) maps to `project_not_approved`. Unlike an inactive
  customer it is never skipped: when no customer could be read, or no candidate was found
  after a failed manager expansion, the classified `project_not_approved` rejection is
  thrown (so two inactive customers plus one not-approved is `project_not_approved`, not
  `no_candidates`); if at least one customer loads, the partial list is kept and a
  sanitized warning is logged.
- **One account per workspace:** the engine `duplicateConstraint`
  (`IntegrationGoogleAds_workspaceId_key`) rejects a second connect; a customer id
  already active in another workspace is non-selectable. Switching accounts =
  disconnect, then connect.
- **Reconnect** (`startGoogleAdsReconnectAction`) re-authorizes the existing
  connection. The shared engine's `completeReconnect` now applies
  `candidateToConfig`, so a reconnect also refreshes the account config columns
  (this benefits other providers using the engine, and is covered by
  `packages/connections/__tests__/service.test.ts`).
- **Return URL.** The engine stores only an application-relative `returnUrl`.
  `connect-flow.ts` (`toSessionReturn`) turns the allow-listed absolute
  `redirectUrl` into a relative path plus `originHost`. The OAuth callback
  relays back to `originHost` before touching the session, then resolves the
  relative path against that origin and re-checks the origin allow-list; a
  since-deactivated domain falls back to the safe in-app path. The callback never appends the session id, so
  `pointReturnUrlAtSession` adds `?session=<id>` right after the session is
  created, which lets the settings page show the outcome of even a terminal
  (denied / failed / expired) attempt. Without a usable `?session=` the page
  resumes the newest unexpired in-flight Google Ads session.

### Dedicated actions, permissions, support sessions

All Google Ads mutations live in `apps/builder/src/features/integration-google-ads/actions/`
and go through `assertCanManageGoogleAds`: **workspace super admin only, and
never a platform support session** (`isSupportSession`; a support session carries
a synthetic `superAdmin: true` membership, AGENTS.md invariant 19, so it is
rejected explicitly). Rejected for support sessions: start connect, reconnect,
pick account, cancel connect, disconnect, retry event, validate request. The one
exception is `syncGoogleAdsConversionActionsAction`, which only reads from Google
and refreshes our cache and stays available to a support session (it still
requires super admin).

`disconnect` and `cancel` use `workspaceActionClientAllowExpired` (AGENTS.md
invariant 14): they must remain available when a trial-expired workspace is
read/delete-only.

**The generic connections API refuses `googleAds`.** The private oRPC router and
the public `/v1` router only check workspace membership / token scope, so
`assertGenericProviderAllowed` (`apps/builder/src/features/connections/lib/assert-generic-provider-allowed.ts`)
throws `connectionProviderDedicatedOnlyException` (403) for create, reconnect,
rename, refresh, disconnect and the connect-session targets/cancel endpoints.
`verify` and reads stay open. Google Ads exposes only the three read-only `googleAds.*`
public operations (see Statistics and public API); writes stay UI-only.

## Conversion actions

- Listed from the **conversion customer** with GAQL
  `conversion_action.type = 'UPLOAD_CLICKS'` (all statuses, so disabled ones can
  be diagnosed) and cached in `IntegrationGoogleAds.conversionActions`. No action
  is created automatically; the UI links to Google's "create an offline import
  conversion action" help. 
- **gbraid needs a `MANY_PER_CLICK` ("Every") action.** Data Manager rejects a
  gbraid on a `ONE_PER_CLICK` action at processing time
  (`PROCESSING_ERROR_REASON_ONE_PER_CLICK_CONVERSION_ACTION_NOT_PERMITTED_WITH_BRAID`),
  so `recordGoogleAdsConversion` refuses it up front with outcome
  `incompatibleAction` (flow step error `google_ads_incompatible_action`; the trigger
  action logs the outcome) and writes no row. `ONE_PER_CLICK` stays usable for a
  gclid, and an action cached without a counting type is not blocked. The UI
  (settings table and the flow/trigger picker) shows a note on `ONE_PER_CLICK`
  actions; they are not disabled.
- **External-attribution actions are unsupported.** The GAQL also reads
  `conversion_action.attribution_model_settings.attribution_model`
  ([ConversionAction fields, v25](https://developers.google.com/google-ads/api/fields/v25/conversion_action),
  enum value `EXTERNAL`), cached as `attributionModel` (zod/TS only, no migration;
  entries cached before it was read have no value and stay usable until the next
  sync). Data Manager cannot ingest those conversions
  (`PROCESSING_ERROR_REASON_EXTERNAL_ATTRIBUTION_DATA_MISSING`), so
  `recordGoogleAdsConversion` refuses an `EXTERNAL` action with `unsupportedAction`
  (flow step error `google_ads_unsupported_action`) and the pickers list it disabled
  with a translated label; the settings table and the validate dialog mark/skip it.
- The conversion customer is read from
  `customer.conversion_tracking_setting.google_ads_conversion_customer` of the
  connected customer (falling back to the customer itself).
- **Refresh paths:** after connect (`pickGoogleAdsAccountAction`), on demand
  ("Sync" action), a reconnect/single-account session that completes in the
  picker (it calls the Sync action so a stale `setupError` clears), and the
  **daily** cron (below). Failures never throw a raw
  provider error: they land in `setupError` (`403`/`404` →
  `conversion_customer_inaccessible`, anything else → `sync_failed`, missing
  token → `developer_token_missing`).
- `recordConversion` accepts only an action that exists in the cache and has
  status `ENABLED`.

## Producers

Two producers call `googleAdsConversionService.record`:

1. **Flow step `sendGoogleAdsConversion`** (`packages/flow-config/src/steps/send-google-ads-conversion.ts`;
   worker `send-google-ads-conversion-step-handler.ts`). Fields:
   `conversionActionId` (numeric), `value`, `currency` (together or not at all),
   `dedupMode` (`click` | `id` | `event`, required), `dedupId` (required in `id` mode, ≤ 64)
   and an optional `conversionTime`, each template-able (`{{variable}}`). Two
   outgoing states: success and error.
2. **Trigger action `sendGoogleAdsConversion`** (`apps/worker/src/trigger/services/action-executor.ts`).
   Same field set, validated with the same schema. It prefers the threaded /
   most recent inbox if that inbox carries a Google click, otherwise falls back
   to the contact's latest clicked inbox (the click may have arrived on WhatsApp
   while the trigger fires on Messenger). There is no error branch: a refusal goes to
   a warning, and only a configuration refusal (invalid value, dedup ID, customer
   property or conversion time) is also written to the Error Log. (The flow step writes the same failures to the Error
   Log too, and additionally follows its error branch.)

Both producers call one helper, `resolve-conversion-inputs.ts`: it stamps
`recordedAt = new Date()` first, loads the workspace consent (independently of any
connection), resolves `{ value, currency, dedupId, conversionTime, consent templates }`
in ONE `resolveContactVariablesDeep` call and turns the consent into a typed input.

`record` returns a typed outcome and writes **no row** on any refusal:

| Outcome | Flow step `errorMessage` code | Meaning |
|---------|-------------------------------|---------|
| `queued` | (success) | Row inserted (or an existing duplicate recovered). |
| `noClick` | `google_ads_no_click` | Inbox has no `gclid`/`gbraid`, no usable `googleClickReceivedAt`, or is not WhatsApp/Messenger. |
| `noAccount` | `google_ads_no_account` | No ready Google Ads account in the workspace. |
| `unknownConversionAction` | `google_ads_unknown_conversion_action` | Action id not in the synced cache. |
| `actionDisabled` | `google_ads_action_disabled` | Action status is not `ENABLED`. |
| `invalidValue` | `google_ads_invalid_value` | Value/currency fail the shared Meta CAPI validators or are not both present. Also written to the workspace Error Log with the resolved values. |
| `invalidInput` | `google_ads_invalid_input` | The step's fields fail validation after template resolution. Also written to the Error Log. |
| `missingDedupId` | `google_ads_missing_dedup_id` | `id` mode and the resolved ID is blank or still contains `{{`. Error Log. Nothing is sent and there is no fallback to a message or job id. |
| `invalidDedupId` | `google_ads_invalid_dedup_id` | The resolved ID is longer than 64 characters. Error Log. |
| `invalidConversionTime` | `google_ads_invalid_conversion_time` | The provided time is not an RFC 3339 date-time with a zone, or is in the future. Error Log. |
| (consent) | `google_ads_invalid_consent_config` / `google_ads_invalid_consent_value` | The saved consent document cannot be read, or a contact field resolved to something other than `granted` / `denied` (any case; empty is omitted). Error Log names the setting, never the value. |
| `unsupportedChannel` | `google_ads_unsupported_channel` | The inbox's channel is not in `GOOGLE_ADS_CHANNEL_VALUES`. Decided in `recordGoogleAdsConversion` (the one gate); the flow step and trigger action only map the outcome. |
| (exception) | `google_ads_record_failed` | Unexpected failure; logged with a sanitized message only. |

Blank strings after template resolution count as "not provided". Line 1 of every
Error Log detail written for these failures is the code; the builder translates it
(see "Error handling").

## Dedup and identity (plan D8, revised by 2026-10-08 §4.4)

The unique index `(workspaceId, transactionId)` plus a **deterministic
`transactionId`** (`buildTransactionId`, `packages/business/src/google-ads/transaction-id.ts`)
collapse BullMQ retries, redrives, duplicate webhooks and flow reruns onto one
event. The id never comes from wall-clock time, a message id or a job id. The
admin chooses the mode per step / trigger action (`dedupMode`); the builder
defaults it by the conversion action's category (lead-like → `click`, anything else
→ `id`), but the saved value always wins and the category never changes identity.

| Mode | `transactionId` (sent to Data Manager) | `options.identity` |
|------|----------------------------------------|--------------------|
| `click` ("Once per ad click") | `gads-v2-{conversionActionId}-c-{sha256(ns + ":" + clickId)[0..32]}` | `keySource: "click"`, `id: null` |
| `id` ("Once per order or event ID") | `gads-v2-{conversionActionId}-i-{sha256(ns + ":" + dedupId)[0..32]}` | `keySource: "explicit"`, `id: dedupId` |
| `event` ("Every time it runs") | `gads-v2-{conversionActionId}-e-{sha256(ns + ":" + occurrenceKey)[0..32]}` | `keySource: "occurrence"`, `id: null` (the key is never stored) |

`ns = workspaceId + ":" + conversionCustomerId`.

- **`gads-v2-` format.** The prefix marks the identity format; the ids are ≤ 59
  characters with a 16-digit action id, inside Google's 64-character transaction ID
  limit, and keep the click id and the business ID out of the provider key.
- **Per-action scope.** Google scopes a transaction id per conversion action
  (Data Manager `DUPLICATE_TRANSACTION_ID`, legacy `ORDER_ID_ALREADY_IN_USE`), and
  the action id is in the formula, so a funnel with one action per stage never
  collides. `id` mode has no step, trigger, contact or inbox component: the same ID
  from two steps, triggers or reruns is one conversion; `click` mode is one per
  click per action.
- **Workspace namespace.** Several workspaces can upload to one Google conversion
  action (shared account or manager); without `ns` two workspaces sending order
  `1042` would collide and Google would drop the second. With `ns` their provider
  ids differ, and switching a workspace to another Google Ads account also changes
  the ids. Within one workspace and account the same key always maps to the same id.
- **Conversion time, value and consent never participate**, so back-dated replays
  and re-imports dedup on the ID. A duplicate record keeps the existing row, its
  `options` and its `occurredAt` (first snapshot wins, also across clicks in `id`
  mode).
- **Lead actions with several genuine leads on one click** are switched to `id`
  mode with a per-lead ID; the UI shows a note. `ONE_PER_CLICK + gbraid` is still
  refused (`incompatibleAction`) in both modes.
- **Legacy method:** `orderId = "v1-" + sha256(transactionId)[0..40]`. The `v1-` names
  the legacy order-id format, not the identity version; only its input (`gads-v2-…`)
  changed. Neither method sends the business ID as-is: Data Manager receives the
  hashed `gads-v2-…` id and legacy hashes it again.
- **A missing or over-long ID fails visibly** (flow step error branch / trigger Error
  Log, nothing recorded). There is no fallback to once-per-click.
- **`event` ("every time it runs")** is one conversion per occurrence of the step or
  trigger action, never per click or business ID. Its provider id uses the `e` segment
  of the same `gads-v2-` format (disjoint from `c` and `i`, no migration: the policy is
  a jsonb value). The id is safe against retries only because the producer supplies a
  **durable occurrence key**; a random or time-based value is never used:
  - Flow step: `flow:{flowExecutionKey}:{contactInboxId}:{stepId}`, where
    `flowExecutionKey` is the BullMQ job id. A fallback key minted at random
    (`flow-inline-…`, `integration-job-…`) is not durable, so the key is left out and
    the step takes its error branch with `google_ads_missing_occurrence_key`.
  - Trigger action, event-driven: `trigger:{triggerJobId}:{triggerId}:{actionIndex}`,
    joined with the contact id (not the click inbox, which is re-picked on every
    attempt). Date-time triggers: `datetime:{triggerId}:{contactId}:{actionIndex}:{digest}`,
    where the digest covers the contact's values for the trigger's date fields: it
    identifies what was scheduled, so a re-sweep after a crash (even past UTC midnight)
    reuses the key, and editing the date is a new occurrence.
  - A flow continuation (the next step of the same node) is enqueued with the parent's
    `flowExecutionKey`, so a retried parent that enqueues a second continuation still
    reaches the step with the same key. Continuations across a node jump or a wait/resume
    still start from their own job id.
  - Limits: a retry of the same job counts once (same key); a loop that comes back to
    the step, or a flow that starts again, is a new occurrence. A conversion action
    counted "One per click" in Google still keeps only the first conversion of a
    click; `event` mode changes what ChatbotX sends, not Google's counting.

## Customer matching (hashed e-mail and phone)

Optional, off by default, Data Manager only. Plan:
`docs/plans/2026-10-08-google-ads-user-data-enrichment.md`.

- **Configuration:** the step / trigger action stores `matchEmail` and `matchPhone`, each
  blank or **one `{{variable}}`** (`{{email}}`, `{{phone}}`, a custom field...) entered in
  the same tiptap field as Value. A literal address or number, or text around the variable,
  is refused by the schema (`matchTemplateInvalid`): it would put personal data in the
  saved flow.
- **Recording:** `record()` writes a v2 `options` snapshot (v1 stays untouched when nothing
  is configured) with `matching: { status, email, phone }`, the two variables only.
  `status` is `enabled` (Data Manager and recorded `adUserData` is **granted**),
  `withheldConsent` (not provided, denied, or a blank variable) or `unsupportedTransport`
  (the legacy upload cannot carry it). No identifier and no hash is ever stored.
- **Delivery:** for an `enabled` snapshot, `loadMatchingIdentifiers` loads the event's
  contact inbox (scoped to its workspace) and calls the resolver the worker injects
  (`apps/worker/.../resolve-matching-templates.ts`, one `resolveContactVariablesDeep`
  call; the variable engine depends on `packages/business`, so it cannot be imported
  there). The values are normalised with Google's rules (`google-ads/hash-user-data.ts`:
  lowercase, no whitespace, Gmail dots and `+suffix` removed; phones as E.164 **with** the
  `+`, validated by `libphonenumber-js`, no regional guessing, no extensions; a bare
  international digit string such as a WhatsApp `wa_id` is read as `+<digits>`) and hashed
  with SHA-256 (hex). The Data Manager request gets `events[].userData.userIdentifiers`
  and request-level `encoding: "HEX"`. A value that cannot be normalised is dropped; with
  none the conversion goes out click-only and an info log (ids only) says so.
- **Consequences of recomputing at delivery** (decision, see the plan): a retry is not
  byte-identical if the contact was edited meanwhile; a deleted contact degrades to
  click-only; consent is the snapshot taken at recording. The `transactionId` never
  changes. A lookup failure is a transient error and is retried, never turned into a
  click-only send.
- **Visibility:** event history / public API show only `customerMatching: { status,
  fields }` (which identifiers are configured), never a variable, value or hash. The
  history reads "Configured: ...", not "sent": whether a value existed at delivery is
  deliberately not persisted (see the plan, section 4).
- **Privacy:** hashes and raw values must never reach logs, errors, `fieldWarnings` or jobs;
  see the redaction patterns in `integrations/google-ads/src/lib/redact.ts` and the
  field-warning allowlist in `delivery.ts`.

## Customer properties (`userProperties`)

Optional, off by default, Data Manager only (plan P3). Two advertiser-assessed facts about
the customer, both on the **event** (`events[].userProperties`, not under `userData`, and no
`encoding` needed):

- `customerType`: `NEW` or `RETURNING` (Data Manager also has `REENGAGED`; it is not offered
  until a use for it exists).
- `customerValueBucket`: `LOW`, `MEDIUM` or `HIGH`.
- **Configuration:** `customerType` / `customerValueBucket` on the step / trigger action, each
  blank, a fixed value (normalised to upper case by the schema) or a `{{variable}}`
  (`optionalTemplateOrStatic`). A fixed value outside the list fails validation with an i18n
  key (`customerTypeInvalid`, `customerValueBucketInvalid`).
- **Recording:** the worker resolves the templates (same deep call as the other fields) and
  `record()` parses them (`customer-properties.ts`). Blank and an unresolved `{{...}}` mean
  "not set"; any other value that is not allowed refuses the conversion with
  `invalidCustomerProperty` (Error Log code `google_ads_invalid_customer_property`, printing
  the resolved value only when it is a short word such as `VIP`; anything with digits,
  `@` or `+`, or longer than 24 characters, prints `[withheld]` in case a variable was
  mapped to a personal field by mistake). The RESOLVED values are stored in the v2
  snapshot as `customerProperties: { status, customerType, customerValueBucket }`, with the
  same `status` rules and the same gate as customer matching (`enabled` only for Data
  Manager and recorded `adUserData` **granted**). v1 stays untouched when nothing is set.
- **Delivery:** `userPropertiesOf(snapshot)` returns the values only for `enabled`; the
  integration validates the enums again and treats a bad value as terminal
  (`invalidUserProperty`). The legacy upload ignores them.
- **Visibility:** the history "Properties" column shows the values when `enabled`, otherwise
  why they are not sent.

## Delivery state machine (plan D9)

```
pending ──claim──▶ sending (claimToken) ──▶ sent (requestId) ──▶ processed
   ▲                  │  │                       │
   │  release/defer   │  └▶ failed               └▶ failed (processing / timeout)
   └──────────────────┘  └▶ skipped_no_account | skipped_expired
```

- **Enqueue:** `record` inserts `pending`, then enqueues the integration job
  `sendGoogleAdsConversion` with `jobId = google-ads-send-{eventId}-a{attempt}`
  (no `:`, BullMQ rejects it) and `delay = max(0, googleClickReceivedAt + 6h - now)`
  computed once at enqueue. Queue options are `adsConversionRetryOptions`
  (BullMQ `attempts: 5`, exponential backoff from 30 s). A duplicate whose job is
  gone (enqueue failed after insert) is redriven, not dropped.
- **Generations.** `event.attempt` is our own counter. Every redrive (retry from
  the UI, sweeper, deferral, transient Google failure) moves the event to
  `attempt + 1` and enqueues a **new** job id, so BullMQ's retained-job
  de-duplication can never swallow a re-add. A `{event, attempt}` pair is enqueued
  at most once. Cap: `MAX_REDRIVE_GENERATIONS = 30`.
- **Fenced lease.** `claimForSending` does `pending → sending` with a fresh
  `claimToken` only if `status = pending AND attempt = <job's attempt>`. A stale
  job, duplicate delivery or concurrent sweeper claims nothing. `finishSending` /
  `releaseClaim` match on the claim token; a rotated token (sweeper redrive) makes
  a late finisher a no-op.
- **Pre-flight guards** (`evaluateDeliveryGuards`, in order), after a successful
  claim:
  1. account missing, or `customerId` / `conversionCustomerId` differs from the
     event snapshot → `skipped_no_account`;
  2. advisory expiry (below) → `skipped_expired`;
  3. connection `needs_reauth` → defer 1 h (`REDRIVE_DELAY_MS`);
  4. readiness not `ready` → `skipped_no_account`;
  5. click younger than 6 h (`MIN_CLICK_AGE_MS`) → defer for the remaining time.
- **Deferral** releases the lease and enqueues generation `attempt + 1`. Once
  `attempt >= 30` (~24 h of hourly deferrals) the event is failed
  (`Delivery deferred too long`) without an Error Log entry.
- **Send:** one `buildContext` per delivery, then
  `integrationGoogleAds.runAction("ingestEvent")`. Token refresh is owned by the
  SDK (`runAction` → `refreshAuth` → auth store save, or `markOffline` →
  `needs_reauth`). An `AuthException` / `AuthRefreshException` defers 1 h. Success →
  `sent` with `requestId`, `sentAt`, `processingStatus = processing` and
  `nextProcessingCheckAt = now + 3 h`. A response without a `requestId` fails the
  event.
- **Errors:** a `GoogleAdsException` that is not retryable (4xx other than
  408/429) fails the event immediately (`failureStage = delivery`) and writes a
  provider error (`provider: "google-ads"`) to the Error Log. Retryable errors
  (408, 429, 5xx, plain network errors) release the lease **without** changing the
  generation and rethrow a sanitized error so BullMQ retries; on the last BullMQ
  attempt the event is failed.
- **Advisory expiry** (`isConversionExpired`, both rules receipt-based
  approximations, since `googleClickReceivedAt` can be days after the real click):
  - **Rule A**, click age at delivery: `now - googleClickReceivedAt` > 90 d →
    `skipped_expired`.
  - **Rule B**, click → conversion: `occurredAt - googleClickReceivedAt` > the
    action's click-through lookback window (`null` → 90 d) → `skipped_expired`. The
    lookback bounds click → conversion only; delivery − receipt is bounded by 90 d
    alone.
  - No local rule on conversion age (`now - occurredAt`): Google decides, and a
    back-dated conversion that is too old fails as `failed(processing)` / terminal
    `failed(delivery)` instead. A conversion before the click is likewise left to
    Google (`CONVERSION_PRECEDES_CLICK` / `CONVERSION_PRECEDES_EVENT`, terminal).
  - `occurredAt` is stored as given (no clamp, no CHECK); delays, redrives and the
    sweeper run from the click receipt, never from `occurredAt`. Google's processing
    status stays authoritative; these checks only avoid pointless uploads.
- **Manual retry:** the history UI's Retry works on `failed` events only
  (`redrive` from `failed`, expected attempt), then enqueues with the usual
  6 h-gate delay.

## Upload methods (Data Manager vs legacy)

Plan: `docs/plans/2026-10-07-google-ads-upload-method.md` (see its section 5 for
the binding review changes C1-C13).

| | Data Manager (default, recommended) | Legacy upload (opt-in) |
|---|---|---|
| API | `datamanager.googleapis.com/v1/events:ingest` | Google Ads API v25 `customers/{cid}:uploadClickConversions` |
| OAuth scopes | `adwords` + `datamanager` | `adwords` only |
| Developer token | never sent | sent only when set (optional) |
| Result | accepted, then **polled** (`requestStatus:retrieve`) | synchronous: `processed` right away, **no polling** |
| Provider id | `transactionId` | `orderId = "v1-" + sha256(transactionId)[0..40]` (versioned, non-PII, no truncation of the local id) |
| `requestId` stored | Data Manager request id | `legacy:<jobId>` (namespaced, never sent to `requestStatus:retrieve`) |

- **Choosing:** the platform admin (or reseller, on their own credential) sets
  `uploadMethod` on the Google Ads credential card; absent = Data Manager. It is
  non-secret and part of the public projection. It is NOT inferred from whether a
  developer token was typed.
- **Pinning (C1/C4):** the connection's method is captured at connect time into
  `auth.metadata.uploadMethod`; each event copies it into
  `GoogleAdsConversionEvent.uploadMethod` at record time and **delivery routes by
  the event's column**, never by the live credential or auth. A redrive never
  changes it. Switching the credential's method therefore affects only new
  connections (reconnect existing workspaces) and, for those, only new events.
  The settings row shows the connection's method; the event history labels
  legacy rows.
- **Scopes:** one resolver `requiredScopesFor(method)` drives the authorize URL,
  the callback scope check, `verify`, the daily refresh and the delivery/validate
  preflight. A grant missing a scope the method needs is `needs_reauth` /
  `scope_missing`.
- **Legacy semantics:** no polling (never `sent`-then-poll); `conversionDateTime`
  is deterministic UTC `YYYY-MM-DD HH:mm:ss+00:00` and `occurredAt` is preserved;
  replays send byte-identical conversions. `partialFailure: true`: the response
  is Zod-parsed (a valid decimal-string `jobId` and exactly one successful result
  are required, anything else is terminal-malformed), and `partialFailureError`
  is classified: transient/delayed (`TOO_RECENT_EVENT`, `TOO_RECENT_CONVERSION_ACTION`,
  quota, `INTERNAL`, `UNAVAILABLE`) are requeued with the existing deferral;
  permanent validation errors are terminal `failed(delivery)` with a sanitized
  message; unknown shapes are terminal with a fixed message (an accepted request
  is never blindly resent).
- **Duplicate recovery (C3):** a duplicate-class error
  (`CLICK_CONVERSION_ALREADY_EXISTS`, `ORDER_ID_ALREADY_IN_USE`) on a **replay** of
  an event we already attempted means Google has it (e.g. Google succeeded, then
  our DB write failed): the event becomes `processed` with
  `processingDetail.duplicateRecovery = true`. On a first attempt it is a terminal
  failure. Completion is a single lease-fenced repository write
  (`finishSendingProcessed`: CAS on `claimToken` + `attempt`).
- **`legacy_upload_not_allowed` (C4/C10):** `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`
  (in either error envelope; HTTP 403 is not assumed) on a legacy upload or
  validation. The message tells the admin to switch the credential to Data
  Manager **and reconnect this workspace**; the stable code is threaded through
  `validateIngest` and the connect error codes.
- **Unchanged for both methods:** `ONE_PER_CLICK + gbraid` is refused, external
  attribution actions are excluded, consent is never fabricated (an unset
  source is omitted, never GRANTED), the identity formula, the 6 h gate and the
  timing rules A/B (see "Delivery state machine"). The 2026-10-07 rule C9
  (`min(90 d, action lookback)` on upload time) is superseded by 2026-10-08 §6;
  `googleClickReceivedAt` is a conservative receipt-time proxy.
- **Consent per transport** (`consentForTransport`, shared by delivery and Validate):
  Data Manager sends `adUserData` and `adPersonalization` as `CONSENT_GRANTED` /
  `CONSENT_DENIED`; legacy sends `adUserData` only (`GRANTED` / `DENIED`) because the
  v25 `Consent.ad_personalization` is limited to OfflineUserDataJobService /
  UserDataService. A configured ad personalization is withheld on a legacy event
  (history shows "Not supported (legacy upload)"; the settings and Validate dialog
  say so).
- **Eligibility uncertainty (R1, C13):** after the developer-token sunset Google
  documents that the `UploadClickConversions` restriction "remains in effect" but
  not how it maps onto Cloud projects. Whether a *new* project may use legacy is
  therefore unknown; Data Manager stays recommended, and legacy failures surface
  as `legacy_upload_not_allowed`. Live eligibility is an opt-in manual check, not
  something the fake-server tests assert.
- **Retirement policy (R2, C13):** legacy is on Google's deprecation path. The
  adapter is one file (`integrations/google-ads/src/apis/legacy-upload.ts`) plus
  one enum value. Removing it requires first migrating saved legacy connections
  (reconnect on Data Manager) and draining unresolved legacy events (`pending`,
  `sending`, deferred); only then drop the value, the CHECK member and the UI
  label.
- **Migration note:** `GoogleAdsConversionEvent.uploadMethod` is `text NOT NULL`
  with `CHECK IN ('dataManager','legacy')` and no DEFAULT (created that way in the
  single `add_google_ads_conversions` migration), so every insert must write the
  column explicitly.
- **Top-level errors (legacy):** a non-2xx response whose body is a
  `GoogleAdsFailure` is classified over its **complete** error list with the same
  classifier as `partialFailureError` (not-allowlisted > permanent > duplicate >
  transient): HTTP 400 `TOO_RECENT_EVENT` is requeued, a top-level duplicate recovers
  on replay, and a later not-allowlisted error is never hidden. A 401 stays an auth
  failure; a body without Ads error codes (5xx, 429, ...) keeps the status-based
  handling.
- **Success shape:** the single `results` entry must be a `ClickConversionResult`
  that echoes the request: the click id of the requested type (`gclid`/`gbraid`) OR
  the requested `conversionAction` resource name. A failed entry is `{}`; an empty,
  foreign or unrelated object is terminal `malformedResponse` (fixed message, no ids).
- **Granted-scope preflight (delivery):** before sending, the connection's stored
  grant is checked against `requiredScopesFor(event.uploadMethod)`. An insufficient
  grant (e.g. a Data Manager event after the workspace reconnected as legacy,
  `adwords` only) defers through the `needs_reauth` bounded deferral; it never sends
  and never fails terminally until the deferral budget runs out.
- **Known limitation:** the upload method is inferred from the Google-granted
  scopes (there is no `ConnectSession` column), so changing the credential's method
  while a user is mid-consent can make that single connect fail with `scope_missing`;
  reconnecting fixes it.

## Data Manager API specifics

Uploads use the **Data Manager API** by default
(`POST https://datamanager.googleapis.com/v1/events:ingest`), not
`ConversionUploadService.UploadClickConversions`, which is restricted
(see "Upload methods" for the opt-in legacy path). Scope `datamanager`; **no
developer token**.

- One event per request (one BullMQ job per event). Request:
  `destinations[0] = { loginAccount, operatingAccount, productDestinationId =
  conversionActionId }` with `accountType: "GOOGLE_ADS"`; `events[0] = {
  transactionId, eventTimestamp (ISO), adIdentifiers: {gclid|gbraid: id},
  eventSource: "MESSAGE", conversionValue?, currency? }`.
- `operatingAccount` **must be the conversion customer**. `loginAccount` must have
  write access to it ([`Destination`](https://developers.google.com/data-manager/api/reference/rest/v1/Destination)),
  so it comes from the single helper `resolveLoginAccountId`
  (`packages/business/src/google-ads/login-account.ts`), used by delivery and by
  `validateIngest`: when the conversion customer is the connected account, it is
  `loginCustomerId ?? customerId`; when the conversion action belongs to **another**
  account (typically a manager `M`), it is `loginCustomerId ?? conversionCustomerId`
  (the same manager route if the user reached the account through one, otherwise
  sign in directly as the owner). Topologies: same account direct, same account via
  manager, cross-account direct, cross-account via manager. The Google Ads API reads
  of the conversion customer's actions use the same route (`login-customer-id` =
  the connection's `loginCustomerId`, omitted when reached directly).
- Re-sending an existing `transactionId` for the same action is an *adjustment*.
- **Duplicate recovery.** A redrive or manual retry can re-ingest an event Google
  already processed. When every `errorCounts` reason is `DUPLICATE_TRANSACTION_ID` or
  `DUPLICATE_GCLID` (bare or `PROCESSING_ERROR_REASON_`-prefixed), `classifyRequestStatus`
  returns `duplicate` and housekeeping finishes the event as `processed` with
  `processingDetail.duplicateRecovery = true` (the same flag as the legacy path).
  The flag is diagnostics only: it is stored in `processingDetail` and not rendered,
  so the history shows a plain Processed. Any other reason keeps precedence over a duplicate.
- Request-level validation is atomic but **processing is asynchronous**: the
  response carries `requestId`; the outcome is read later with
  `GET /v1/requestStatus:retrieve?requestId=`.
- `validateOnly: true` powers "Validate request" (a configuration check, not an
  end-to-end test).
- Consent comes from the event's `options.consent` snapshot: `adUserData` /
  `adPersonalization` are sent as `CONSENT_GRANTED` / `CONSENT_DENIED`, a `null`
  status is omitted, and when both are omitted the `consent` object is omitted so
  Google applies the account or data-connection default (a denied or
  defaulted-denied ad user data → `DENIED_CONSENT`, not recorded). `eventSource` is
  fixed to `MESSAGE` with no fallback.
- `options = null` (older rows) sends no consent; an unknown `options.version` is a
  terminal `failed(delivery)` ("Unsupported conversion options version") with no
  HTTP call.
- Google timing rules (authoritative): clicks younger than 6 h are rejected
  (`PROCESSING_ERROR_REASON_TOO_RECENT_CLICK`); the conversion time must be after the
  click; a click is valid for at most 90 days and within the action's click-through
  window; an event older than Google's maximum supported age is rejected
  (`EVENT_TOO_OLD`, terminal). Google also rejects a second conversion with the
  same gclid **and the same conversion time** (`DUPLICATE_GCLID`): two orders on one
  click given an identical timestamp (for example every order at `T00:00:00`) are
  collapsed by Google and finish as Processed (duplicate recovery; the flag is not
  rendered).
- Google Ads API **v25 REST** (`developer-token` + optional `login-customer-id`)
  is used only for `customers:listAccessibleCustomers` and GAQL `searchStream`
  (`customer`, `customer_client`, `conversion_action`). Customer ids are validated
  as 10 digits before reaching a URL, header or GAQL path.
- Retries are owned by BullMQ (`ky` retry limit 0, 30 s timeout). HTTP 401 becomes
  `AuthException` (the SDK then refreshes once and retries, or marks the
  connection offline); other HTTP failures become `GoogleAdsException` with
  `retryable` = 408 / 429 / 5xx.

## Processing-status poller (plan D9/D10)

Run every 10 minutes by the housekeeping cron. For each `sent` event whose
`nextProcessingCheckAt` is due (100 per page, handled four events at a time, one
setup/context lookup per workspace per run). The run keeps draining pages until a
page comes back short, a 5-minute time budget is spent, or a 50-page ceiling is
reached:

- **Classification** (`classifyRequestStatus`): ChatbotX sends one event to one
  destination, so exactly one `requestStatusPerDestination` entry is expected.
  Zero or multiple entries, or an unrecognized status → `unknown` (poll again,
  never guess). `SUCCESS` → `processed`. `PROCESSING` → keep polling. `FAILED`
  and `PARTIAL_SUCCESS` → failed (with one event, partial success means the event
  itself had a problem), `processingStatus = failed | partial_success`,
  `failureStage = processing`, reasons stored in `processingDetail` and the Error
  Log.
- **Transient Google failures** (`PROCESSING_ERROR_REASON_INTERNAL_ERROR`,
  `PROCESSING_ERROR_REASON_TOO_RECENT_CLICK`; the unprefixed forms are accepted too) with *all* reasons transient → redrive as a new
  generation after 1 h instead of failing (until the generation cap).
- **Backoff** for still-unresolved requests: first check 3 h after sending, then
  6 h → 12 h → 24 h (the last step repeats), indexed by `processingAttempts`.
- **Timeout:** 7 days after `sentAt` → `failed` with `processingStatus =
  timed_out`, `failureStage = timeout`.
- A missing context (blocked owner, `needs_reauth`, customer changed, missing
  request id) reschedules as `unknown`; an error while polling one event is
  logged and rescheduled with the same backoff, and never stops the run; if that
  reschedule itself fails (database error) it is logged and the run carries on.

## Housekeeping crons and the sweeper

Registered in `apps/worker/src/schedule/handlers/register-schedules.ts` (not in
`CLOUD_ONLY_SCHEDULERS`: they run on every edition), executed by
`apps/worker/src/schedule/handlers/google-ads-housekeeping.ts`. Each run is
exclusive (a per-process guard plus the `schedule:<name>` distributed lock, 1 h
TTL) and a skipped run just logs.

| Job | Schedule | Work |
|-----|----------|------|
| `googleAdsHousekeeping` | `*/10 * * * *` | `pollProcessingStatus()` then `sweepStranded()`; both always run, and a poll failure is rethrown only after the sweep finished |
| `googleAdsSyncSetups` | `30 3 * * *` (daily) | `syncSetups()`: for every `IntegrationGoogleAds` row (keyset-paginated, 100 per page) with an active connection, `refreshSetup`. Because the refresh goes through the SDK, a grant Google has revoked flips the Connection to `needs_reauth` here rather than on the next conversion. |

**Sweeper** (`sweepStrandedGoogleAdsEvents`, up to 200 events per window per run;
stale `sending` leases and stale `pending` rows are read by two separate queries
so a wall of pending rows can never starve lease recovery) finds events whose
delivery job is gone:

- `pending` rows untouched for 10 min **and** past the 6 h click gate whose
  current generation's BullMQ job can no longer run (`isSendJobLive`);
- `sending` rows whose lease is older than 15 min (a crashed worker).

Each is moved to a new generation and re-enqueued with the usual 6 h-gate delay.
A stranded event that has used all 30 generations is failed
(`Delivery stranded too many times`) instead.

**Blocked owners.** The delivery job runs under `withBlockedOwnerGuard` (AGENTS.md
invariant 15): a blocked owner is a safe no-op with a bare return, so the job
does not retry or dead-letter. The housekeeping crons themselves are exempt
(they are system jobs) but apply the guard per workspace: the poller reschedules
events of a blocked workspace as `unknown`, the sweeper never sends them. A stale
`sending` row of a blocked workspace is released back to `pending` on the **same
generation** (`releaseClaim`, fenced by its `claimToken`, no enqueue, no Google
call, `attempt` not incremented) so it leaves the claim-ordered lease window
instead of starving other workspaces, and blocked owners never burn generations.
It then rotates through the pending window via `touchStranded` (as does a blocked
or live-job `pending` row) and is rescued by the normal pending path once the
owner is unblocked. This applies at the 30-generation cap too (the release does not
fail the row). The daily sync skips blocked owners.

*Known limitation:* a `sent` event of a blocked owner is not polled (Google is
never asked), but once it is more than 7 days past `sentAt` it is still failed as
`timed_out` with "Google did not finish processing the request in time".

## UI map

| Surface | Where |
|---------|-------|
| Settings page | Settings → Integrations → **Google Ads** (`apps/builder/src/app/space/[workspaceId]/(settings)/settings/integrations/google-ads/page.tsx`, `features/integration-google-ads/components/*`): connection row, account picker (resumes the in-flight session after the OAuth round trip), conversion customer, readiness and `setupError`, conversion actions, **Conversion data consent** section (Ad user data / Ad personalization: Not provided, Always granted, Always denied, From a contact field; the "Learn more" link points to Google's Data Manager consent help, `support.google.com/google-ads-data-manager/answer/13944739`), event history table with Retry, "Validate request" dialog, disconnect. |
| Statistics dashboard | Dashboard → Ads → **Google Ads** (`dashboard/ads/google`, super admin only), linked from the settings history header ("View statistics"); see "Statistics and public API". |
| Conversation badge | A separate "Google Ads" pill in `conversation-item.tsx` (`selectGoogleAdsBadge`, first inbox of the conversation with a click). Carries the click id *type* only, never the id. |
| Contact filter | `fromGoogleAd` (boolean) in the contact filter: an `EXISTS` over the contact's inboxes using `googleClickPredicate()`. |
| Flow step / trigger action | `sendGoogleAdsConversion`, with a shared field component (`google-ads-conversion-fields.tsx`) reading the credential-free `googleAdsAPI.getIntegration`: the conversion action select, a dedup mode select ("Once per ad click" / "Once per order ID" / "Every time it runs") with a one-line hint below it, the ID field in `id` mode, Value / Currency, Customer type / Customer value (Data Manager only; a note on legacy), a collapsed "Customer matching" section, an "Additional options" disclosure holding Conversion time (date picker plus `{{variable}}` input), and a footer line: a link to Google's send-events documentation, or an amber consent warning with a fix link when the saved consent is unreadable. Template inputs use `GoogleAdsTemplateField`. |
| Event history | `events-table.tsx`: **Dedup** ("Per click" / "Every run" / "ID: {id}" cut to 16 characters, full value as the tooltip and accessible name; "—" for rows without `options`), a "Provided time" marker on the Occurred cell when the conversion time came from the step, and a **Matching** and a **Properties** column (what was configured, never the values), and a **Consent snapshot** column (short labels in the cell, full labels as tooltip / accessible text; "To send", "Not sent", "Not confirmed" lead when it is not a normal sent row). |
| Platform credentials | Admin → Platform credentials → Google Ads (own card, `googleAds` credential): client ID, client secret, an **Upload method** select (Data Manager recommended / Legacy upload API) and an optional developer token (secrets are password fields with a "set / not set" indicator; blank keeps the stored value) and the Google Ads callback URL. |
| API (private oRPC) | `googleAdsAPI`: `getIntegration` (any workspace member; credential-free projection built field by field, plus the workspace `consent` and the connection's `uploadMethod`), `getInFlightConnectSession` and `listEvents` (super admin; click ids masked via `maskClickId`; each row carries `identity`, `conversionTimeProvided`, `customerMatching`, `customerProperties` and a derived `consentSnapshot`, never the raw `options`). The snapshot's `delivery` is `sent` for sent / processed / failed(processing | timeout), `toSend` for pending / sending, `notSent` for skipped, `unknown` for failed(delivery); a legacy row reports ad personalization as `notSupported`. |

All strings are i18n keys under `googleAds.*` plus `flows.actions.sendGoogleAdsConversion`,
`trigger.actions.sendGoogleAdsConversion`, `fields.adReferral.googleAds` and the
contact-filter label. Status, error and enum labels are exhaustive
`Record<…>` maps with `satisfies`, so a new enum value without a translation
fails type-checking. Every successful mutation invalidates its TanStack Query
cache (`useInvalidateGoogleAds`, AGENTS.md invariant 21).

## Statistics and public API

Design record: `docs/plans/2026-10-09-google-ads-stats-and-public-api.md` (decisions
D1–D13). The dashboard and the public API read the same service,
`googleAdsConversionService.getStats` (`packages/business/src/google-ads/stats.ts`),
so both show the same numbers. No migration, no worker change.

### Definitions

- **Raw statuses (D1).** Counts are per event status (`pending`, `sending`, `sent`,
  `processed`, `failed`, `skipped_no_account`, `skipped_expired`), all seven always
  present and zero-filled. The API never returns derived buckets. The UI groups them with
  `toStatBuckets` (`packages/business/src/google-ads/stat-buckets.ts`, subpath export
  `@chatbotx.io/business/google-ads/stat-buckets`): confirmed = `processed`, awaiting
  Google = `sent`, queued = `pending` + `sending`, failed = `failed`, skipped = both
  `skipped_*`. A new status that no bucket lists is a compile error.
- **Day basis (D2).** Events are counted on `occurredAt`, the conversion time, the same
  field the history list and the `(workspaceId, occurredAt)` index use. A back-dated
  conversion (the step's Conversion time) lands on its conversion day, not the day it was
  recorded, and a window that does not contain that day never shows it (the history
  list does). Google Ads' standard "Conversions" columns follow the ad-interaction (click)
  date; compare with its "by conv. time" columns.
- **Confirmed = `processed` (D3).** On Data Manager an event stays `sent` until Google's
  asynchronous processing finishes (the poller); on the legacy method it ends `processed`
  at once, and a recovered duplicate also ends `processed`. `sent` is shown as "Awaiting
  Google", never as success.
- **Delivery rate (D4).** `processed / (processed + failed)`, `null` when both are 0.
  Queued, awaiting and skipped events are excluded because their outcome is not final.
- **Confirmed value (D5).** `sum(value)` of `processed` events with a value, per
  `currency`, as exact decimal strings plus the number of events that carried a value. It
  is never summed across currencies. A confirmed row without a currency is not listed.
- **Failures by stage (D6).** `failuresByStage` has `delivery`, `processing`, `timeout`
  and `unknown` (a failed row with no `failureStage`, counted by its own `FILTER`, never
  by subtraction), so the four always add up to `totals.failed`. There is no per-cause
  breakdown: the row has only free sanitized text in `error`.

### Dashboard

Dashboard → Ads → Google Ads (`apps/builder/src/app/space/[workspaceId]/dashboard/ads/google/`:
`page.tsx`, `loading.tsx`, `error.tsx`), super admin only (`resolveGuardedWorkspaceId(…,
"superAdmin")`; a support session reads as a synthetic super admin). The route is static,
so it wins over the dynamic `ads/[channel]`. The page runs on the server, reads search
params (`from`, `to`, `tz`, `channel`, `action`), calls `getStats` and renders the client
view `GoogleAdsStatsView`; a filter change is a `useTransition`-wrapped navigation
(content dimmed and `aria-busy`), with no client fetch and no private oRPC procedure. An
unknown `channel` or non-numeric `action` parses to `null` ("all") instead of reaching the
service.

The Analytics nav shows the "Google Ads" entry only when
`resolveGoogleAdsDashboardEntry` (`features/analytics/lib/google-ads-dashboard-entry.ts`)
is true: the caller is a super admin and the workspace has a Google Ads connection or any
conversion event at all (history survives a disconnect; the date range is ignored). The
contacts, conversations, Meta `[channel]` and Google pages all pass the result as
`showGoogleAds`, so a workspace that never connected Google Ads and has no history does not
see the entry (the URL still opens, with a not-connected box that links to the settings).
A connected workspace (or one with history) always gets the full dashboard: tiles, chart,
the per-action table (its synced actions) and the per-channel list show zeros when the
range is empty, under one short hint line, instead of a single empty box. The settings page
links to the dashboard with "View statistics" in the history section header.

### Stats query shape

`getStats({ workspaceId, from, to, tz, channel?, conversionActionId? })` runs three
repository queries in one `Promise.all` (a failure fails the call, nothing partial):

| Query | Used for |
|-------|----------|
| `statsByDayAndChannel` | `totals`, `timeseries`, `byChannel` and `failuresByStage`, all summed from the same day × channel rows so they always agree. A row outside the enumerated days is dropped from all of them. |
| `statsByAction` | `byAction` (busiest first, latest name and category snapshot, at most 50) and `byActionTruncated` (the query asks for 51). Read separately, so it is best effort against status changes between the reads. |
| `confirmedValueByCurrency` | `confirmedValue`. |

- **Range.** `parseAnalyticsDateRange` normalises `from`, `to` and `tz`: an invalid or
  inverted day falls back to the default, a range over 366 days keeps the most recent 366
  days ending at `to`, and the resolved `range.{from,to,tz}` is echoed (no 422).
- **Timezone.** Days are bucketed in `tz`, in SQL and in the window. An unknown `tz`
  falls back to UTC, and so does an offset such as `+07:00` (Node accepts it, PostgreSQL
  does not, so the two would disagree). The default range is the last 7 days ending
  "today" in `tz`, not in UTC.
- The day expression is the first select key and the group-by uses its ordinal (a bound
  timezone parameter renders as different placeholders in `SELECT` and `GROUP BY`).
- `listByWorkspace` also takes an optional `conversionActionId`, so events can be matched
  to a `byAction` row.

**Indexes and volume.** The queries filter by `workspaceId` and an `occurredAt` range,
served by `(workspaceId, occurredAt)`; `(workspaceId, status)` also exists. The table has
no retention, so it grows without bound; the 366-day clamp bounds each query. No index was
added: the production volume is unmeasured and the `EXPLAIN (ANALYZE)` check on a
synthetic data set has not been run (plan §11). **Follow-up trigger:** a stats p95 above
500 ms; the candidate is `(workspaceId, occurredAt, status)` in its own migration.

### Public operations

Registered as `googleAds` in `apps/builder/src/routers/public.ts`
(`features/integration-google-ads/api/public.ts`, request schemas in `schema/public.ts`).
All use `workspaceTokenAuthAPIForScope("ads")` (the existing `ads` scope, no scope or
migration change), so a `read_only` token works. They are read-only on purpose: recording,
retrying, connecting and consent changes stay UI-only, because an API write would bypass
the click, timing and identity rules (the nine private action entries stay `private:` in
the parity manifest).

| Operation | Route | CLI | Notes |
|-----------|-------|-----|-------|
| `googleAds.getStats` | `GET /v1/google-ads/stats` | `google-ads stats` | `from` and `to` (`YYYY-MM-DD`, required), `tz`, `channel`, `conversionActionId`; returns `googleAdsStatsResponse` (`stats-schema.ts`, shared with the dashboard). |
| `googleAds.listEvents` | `GET /v1/google-ads/events` | `google-ads events` | `page`, `perPage` (1–50, 51 is a 422), `status`, `channel`, `conversionActionId`, `since`, `until`; returns `{ data, pageCount }`. |
| `googleAds.getConnection` | `GET /v1/google-ads/connection` | `google-ads connection` | The credential-free `googleAdsIntegrationResource`: status, upload method, consent view and the synced conversion actions (use an action `id` as `conversionActionId`). Not connected returns `connected: false` and no actions. |

- No request takes a `workspaceId` and no response returns one.
- **MCP: hidden.** No `mcpSpec`: the tools are reachable through `search_tools` /
  `call_tool` only, like the Meta ads analytics; the default MCP tool set is unchanged.
- **Privacy.** Events use the history projection `toGoogleAdsEventResource`: the click id
  is masked, and the row's own click id, `transactionId` and `requestId` are replaced by
  `[redacted]` inside `error`; `transactionId`, `requestId`, claim data, attempt counters,
  `contactInboxId` and `workspaceId` are never returned. Two things remain: `identity.id`
  (the order or event ID the flow sent, which can contain contact data) and Google's
  sanitized error text. Minting the token already requires a super admin; the call-out is
  in `docs/developer/workspace-api-tokens.md`.

## Error handling and log redaction

- Click ids and tokens are secrets. `sanitizeGoogleAdsError`
  (`integrations/google-ads/src/lib/sanitize.ts`) is the only form of a Google
  failure that may be logged or persisted: it redacts `Bearer …`, `ya29.…` access
  tokens, `1//…` refresh tokens, PEM keys, `gclid`/`gbraid`/`wbraid`/
  `access_token`/`refresh_token`/`developer-token` key-value pairs, plus the
  request's own click id passed as `secrets`, and truncates to 1000 characters.
- `GoogleAdsException` deliberately keeps no origin error (the raw HTTP error
  carries the request body). Errors rethrown to BullMQ and the `record` catch
  block are re-created as plain sanitized `Error`s.
- **Data Manager failure explanations.** A 400 carries
  `google.rpc.BadRequest.fieldViolations` (`field`, `description`, `reason`;
  [send-events, failure responses](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events#failure_responses)).
  `parseGoogleAdsOriginError` reads them tolerantly (wrong types are dropped, never
  thrown) and appends at most 5 entries of at most 200 characters, formatted
  `field: description (reason)`, to the exception `details`/message, so
  `validateIngest`'s `detail` and the persisted delivery `error` say why (for example
  `events[0].adIdentifiers.gclid: invalid`). They pass through the same sanitizer as
  everything else (the request's click id is redacted even if Google echoes it; a
  field path such as `adIdentifiers.gclid` is not mistaken for a `gclid=` pair).
- Persisted `error` text and `processingDetail` hold only sanitized messages and
  allow-listed reason counts. The builder never returns the full click id (masked
  in lists; "Validate request" redacts any occurrence in the returned detail).
- Server logs use the structured logger with key `err` (AGENTS.md invariant 20),
  never `console`.
- Provider failures are surfaced in the workspace **Error Log** under provider
  `google-ads` (label "Google Ads"); configuration problems (invalid resolved
  value / dedup ID / conversion time / consent) are also written there with the
  resolved values only (never the consent value, never a click id).
- **Error code translation.** The writer stores the provider in `ErrorLog.action`
  and the message in `ErrorLog.detail`. For Google Ads rows the first `detail` line
  is a stable code from `googleAdsConversionErrorCodes` (`@chatbotx.io/utils/google-click`);
  the Error Log table (`error-logs-table-columns.tsx`, `google-ads-error-detail.ts`)
  shows `googleAds.stepErrors.{code}` translated followed by the remaining lines.
  Unknown text and every other provider render unchanged. The map is an exhaustive
  `Record<GoogleAdsConversionErrorCode, key>`, so a new code is a compile error
  until it has a translation. A flow step's `errorMessage` stays the stable code; no
  builder surface renders step error messages today.

## Security

- Satellite `IntegrationGoogleAds.auth` is **plaintext jsonb**, matching every
  other Connection-engine satellite (Google Sheets / Calendar). That is a known,
  repo-wide convention recorded in the plan, not specific to this feature, and it
  is why the developer token is kept out of it. OAuth tokens in it are the
  advertiser's own grant.
- The generic connections APIs refuse `googleAds` (above); mutating actions
  reject support sessions.
- The public editor-facing projection (`toPublicGoogleAdsSetup`) is built field by
  field and never includes `auth`, `loginCustomerId` or anything added to the row
  later.

## Ops prerequisites

1. **Dedicated Google OAuth app for Google Ads** (not the one used for Sheets /
   Calendar / sign-in; its client ID and secret go into the `googleAds` platform
   credential). Add the scopes `https://www.googleapis.com/auth/adwords`
   and `https://www.googleapis.com/auth/datamanager` to the OAuth app and
   **pass Google's OAuth verification for these sensitive scopes**. Until then
   only listed test users can consent, and refresh tokens of an app in "Testing"
   expire after 7 days (connections will drift to `needs_reauth`). This is the
   critical path for end-to-end use. Register the redirect URI
   `{origin}/integrations/google-ads/callback` (see `docs/tenancy.md`).
2. **Google Cloud project** of that OAuth client: enable the **Google Ads API**
   and the **Data Manager API**, and grant `roles/serviceusage.serviceUsageConsumer`
   to the caller.
3. **Platform credential.** Create the Google Ads platform credential (client
   id, secret, developer token) under Admin → Platform credentials → Google Ads
   (platform owner, or the reseller's own credential for a white-label tenant).
   Google sunset developer tokens on 2026-09-09: API access is now granted to the
   Google Cloud project (see "Google Ads API access" below), so the developer token
   is optional and ignored by Google; the credential field may still be filled and sent.
4. **Customer-ID allowlisting with Google is a manual ops step** (gTech, via the
   Google partner contact). ChatbotX has no code for it, and **the connect UI does
   not tell the advertiser about it**: a connection that succeeds does not mean
   Google has allowlisted the Customer ID, so until it does no click id is embedded
   and no click is recorded. Tell the advertiser out of band. Run the runbook query
   below to list the ids to send.

### Google Ads API access (developer tokens sunset 2026-09-09)

Source: <https://developers.google.com/google-ads/api/docs/api-policy/developer-token>.

- API access levels (Test / Explorer / Basic / Standard) are granted to the
  **Google Cloud project that owns the OAuth client id/secret**, not to a developer
  token. The `developer-token` header is optional and ignored; the existing
  `developer_token_*` causes are kept because the header may still be sent.
- A project at **Test** access calling a production account gets
  `AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` on API v25 (older
  versions: `ACTION_NOT_PERMITTED`). The connect screen shows the `project_not_approved`
  message; the fix is ops-side.
- Apply from the project's **Google Ads API -> Overview** page in Google Cloud Console.
  **Explorer** is the quick path for low-volume production use. **Basic** and
  **Standard** (higher limits) additionally require **brand verification** of the
  OAuth app.

### Runbook: connected customer ids

`integrationGoogleAdsService.listConnectedCustomerIds()` returns the same list
(distinct `customerId` across all workspaces). Equivalent SQL:

```sql
-- Customer ids to register with Google (10 digits, unformatted).
SELECT DISTINCT g."customerId"
FROM "IntegrationGoogleAds" g
ORDER BY g."customerId";

-- Same, restricted to currently connected accounts, with the workspace.
SELECT g."customerId", g."descriptiveName", g."loginCustomerId",
       g."conversionCustomerId", g."workspaceId", c."status"
FROM "IntegrationGoogleAds" g
JOIN "Connection" c ON c."integrationId" = g."integrationId"
WHERE c."status" IN ('connected', 'degraded')
ORDER BY g."customerId";
```

(`Connection."integrationId"` is the join column, unique via
`Connection_integrationId_key`; `Connection."status"` is text.)

Recently failed deliveries, for triage:

```sql
SELECT "id", "workspaceId", "status", "failureStage", "processingStatus", "error", "updatedAt"
FROM "GoogleAdsConversionEvent"
WHERE "status" = 'failed'
ORDER BY "updatedAt" DESC
LIMIT 50;
```

## Rolling deploy

- **Migration:** `packages/database/drizzle/<timestamp>_add_google_ads_conversions/`
  is one migration (five enums, `IntegrationGoogleAds`, `GoogleAdsSettings`,
  `GoogleAdsConversionEvent` with its indexes, FKs and CHECKs). The feature was
  never deployed, so the three migrations written during development were merged
  into it. It is **generate-only**: produced and inspected, never applied by the
  implementer. The owner applies it (`pnpm --filter @chatbotx.io/database
  db:migrate`) after review. `db:check-drift` is registered under the package's
  `lint`. The migration starts with `DROP ... IF EXISTS` for its tables and enums,
  so a development database that already ran the earlier three migrations applies
  it too (their development data is dropped); a clean database drops nothing.
- **Order:** apply the migration first, then deploy **consumers before
  producers** — the **worker before the builder**. The worker must understand the
  `sendGoogleAdsConversion` integration job, the `sendGoogleAdsConversion` flow
  step and trigger action, and the two schedule jobs before the builder can
  create steps/actions that produce them. The WhatsApp / Messenger capture code
  only adds optional referral keys, so its position in the order is not
  critical. This ordering is
  derived from the code structure; it was not exercised in a staged rollout.
- **Deploy order for the conversion options:** deploy `apps/worker` first (producers
  and delivery ship together; delivery tolerates `options = null`), then the builder.
  No backfill.
- A new `googleAds` platform credential type was added (`Credential.type` is
  `text`, not a DB enum, so no migration). The `google` credential is unchanged:
  the never-released optional `adsDeveloperToken` field was removed from it.
  `ContactInboxReferral` only gained optional keys, and `compactReferral` changes only for the six Google keys,
  so older rows keep parsing. A new `IntegrationType` (`googleAds`) was added with
  its full cascade (registry, store binding, channel registry, callback slug).
- Stale or retained BullMQ jobs are harmless: a job whose `{event, attempt}` no
  longer matches claims nothing.

## Known limitations

- **Google's own samples disagree on key spelling.** The decoder code in Google's
  documents reads `campaignid` / `adgroupid` / `adid`, while the WhatsApp test URL
  encodes `campaignId` / `adGroupId` / `creativeId`. Keys are matched
  case-insensitively and `creativeId` is accepted for the ad id, so both decode.
- **Defects in Google's documents (not copied into the code).** The "Example"
  section decodes to `dummy_gclid`, which is not a JSON object; the gTech JSON
  sample has no UTC offset and a wrong endpoint path; the test text says "Hi, How
  can we help you" while the URL carries "Hello, how can I help you".
- **A duplicate answer from Data Manager is treated as "Google already holds it".**
  `DUPLICATE_TRANSACTION_ID` means the same order id and conversion action were
  uploaded before, which is this event's own identity. `DUPLICATE_GCLID` means a
  conversion with the same click and conversion time exists; that may be another
  event, so two runs of an "every time it runs" step for one click inside the same
  second collapse into one conversion at Google while both rows show as processed
  (`duplicateRecovery`). The legacy path only accepts a duplicate on a replay.
- **Data Manager outages, quota and "too recent" answers defer instead of failing.**
  A 408, 429 or 5xx that outlasts BullMQ's retries, and the request-level
  `CONVERSION_ACTION_TOO_RECENTLY_CREATED`, release the event for another
  generation (1 h and 6 h; at most 30 generations), as the legacy path does. The
  processing reason `DESTINATION_TOO_RECENTLY_CREATED` is redriven after 6 h.
- **Matching is withheld while the customer data terms are not accepted.** Google
  fails an event that carries user data when the enhanced-conversions terms are
  unsigned (`DESTINATION_ACCOUNT_ENHANCED_CONVERSIONS_TERMS_NOT_SIGNED`), so the
  conversion is sent by click only (customer properties are not user data and are
  still sent).
- **Google leaves a `false` boolean out of its answer.** For an account whose
  enhanced-conversions terms are unsigned, `conversionTrackingSetting` comes back
  with no `acceptedCustomerDataTerms` key, so a present setting without the key is
  read as "not accepted" (no setting at all stays "unknown"). Delivery sends user
  data only when the stored value is `true`. Confirmed with `validateOnly` on a
  real account: click-only, value and currency, consent, customer properties,
  gbraid and `eventSource=MESSAGE` were accepted, hashed e-mail / phone were
  rejected with `DESTINATION_ACCOUNT_ENHANCED_CONVERSIONS_TERMS_NOT_SIGNED`, and an
  unsupported currency with `INVALID_CURRENCY_CODE`.
- **Not done, by design or for later:** one event per request (no batching, no
  client-side throttle against the Cloud project's 300 requests per minute and
  100,000 per day); the local expiry is always 90 days although Google documents 63
  days when enhanced-conversions user data is sent; "Validate request" sends no
  value, currency, user data or properties; Messenger click times are whole
  seconds, so two clicks in one second resolve by processing order.
- **Ad, ad group and campaign ids are kept on the contact's latest click only**, not
  copied onto each conversion event, so a later click overwrites them for per-ad
  reporting.
- **The design document sent to Google describes a different UI** (an "AdsManager"
  area, a "GA CTWA" label, the attributes `google_ad`, `google_ad_qualified_lead`
  and `google_ad_purchased`, pre-built templates, a funnel report). None of these
  exist; the integration is Settings → Integrations → Google Ads, a "From Google
  Ads" contact filter, and the flow step / trigger action.
- **Not implemented from the partner documents:** Zalo click capture (the carrier
  field is unknown), website-to-message click capture (SOW 5.5.2), a connect or
  disconnect report for the SOW's notification duties, a retention policy for
  stored click ids, and guidance on conversion categories and Primary / Secondary
  goals.
- **Conversion owner reachable only through a manager route different from the
  connected account's.** A user who reaches client C directly but conversion
  owner M only through manager X: C is stored with no `loginCustomerId`, so the
  setup read of M's actions carries no `login-customer-id` and fails. The setup
  card then shows `conversion_customer_inaccessible` (an explicit error, never a
  silent failure). Reconnecting with a Google account that reaches both through
  the same manager, or directly, resolves it. A per-owner access route is not
  persisted in v1.
- **A transient failure while discovering accounts during a *reconnect*** fails
  that reconnect session with `internal_error` (the customer sees the error alert
  and can try again). The first connect keeps its session for retry; the
  reconnect path does not persist the exchanged authorization first.

- **Lost enqueue after a transient processing failure:** the 6-hour wait after a
  `TOO_RECENT_CLICK` / `INTERNAL_ERROR` processing failure lives only in the delayed
  job. If the redrive succeeds but the enqueue fails or the process crashes, the
  sweeper recovers the row using the click age only and sends immediately; the
  worst case is one more Google rejection and another bounded redrive (generation
  cap 30). Persisting a "not before" timestamp would remove this; not done in v1.

- **No rule engine.** Conversions come only from the flow step and the trigger
  action. (Meta's equivalent rule engine is a hidden page and is not mirrored.)
- **No auto-created conversion actions.** The advertiser must create an
  `UPLOAD_CLICKS` action in Google Ads first.
- **The public API is read-only**: three `googleAds.*` GET operations (stats, events,
  connection), with CLI commands and hidden MCP tools; there are no public writes, and
  the generic connections API refuses `googleAds`.
- **Consent is workspace-wide.** One setting per workspace applies to every
  conversion; "Always granted" is the workspace's own legal statement. A per-step
  override and the "each new event" identity mode are deferred.
- **One Google Ads account per workspace**; switching = disconnect + connect.
- **WhatsApp and Messenger only.** Zalo is unverified (see the spike section);
  `GOOGLE_ADS_CHANNEL_VALUES` is `whatsapp | messenger`.
- Legacy Messenger raw `ref=<gclid>` (no `gclid:` prefix) is unsupported.
- **19 non-English/non-Vietnamese locales are machine-translated** and have not
  been reviewed by native speakers: ar, az, da, de, es, fi, fr, he, id, it, ja,
  nl, pt-BR, pt-PT, ro, sv, tr, zh-CN, zh-TW. (The i18n check requires every key
  in every locale.)
- **Relative redirect / `originHost`.** The connect return URL is stored as a
  relative path; the callback's existing relay returns the browser to `originHost`
  and the path is resolved there. A custom domain deactivated between connect
  start and callback falls back to the in-app default redirect (`/manage`) instead
  of the settings page.
- **Advisory timing.** The 6 h and rules A/B checks are ours and receipt-based;
  Google's processing status is authoritative, so an upload we sent can still be
  rejected (for example a back-dated conversion that is too old).
- **"Validate request"** is a `validateOnly` configuration check, not proof the
  conversion will process.
- **Dedup limits:** identity is only as good as the ID the admin supplies (stable
  across retries, unique per purchase, ≤ 64 characters). A varying value such as the
  current time defeats dedup. See "Dedup and identity".
- **Phones without `+`:** a bare digit string is read as international (WhatsApp `wa_id`),
  so a national number in a custom field can be read as another country's number.
- Click ids remain on events after contact deletion (see Tables).
- Satellite `auth` is plaintext (repo convention); `googleSheets` also deviates
  from the `makeAuthStore` naming convention (harmless, it has no `refreshAuth`).

## Zalo spike (not performed)

**No Zalo Official Account test was run in this implementation.** There was no
OA and no webhook access available, so there are **no results** and no captured
fixture. Everything below is the procedure still to be done; nothing in it has
been observed.

What is known from documents only:

- Google's partner documents describe the Zalo URL as
  `<oa url>?dynamin_param=gclid:<id>,…` (Google's spelling of the parameter).
- Zalo's public webhook documentation documents **no field** that carries this
  parameter: `follow.source` is one of `oa_profile | message_invite |
  social_plugin`, and `user_send_text` carries only `message.{msg_id, text,
  attachments}`, the same shape as `integrations/zalo/src/schema/webhook.ts`.
- Therefore no Zalo capture code exists and `GOOGLE_ADS_CHANNEL_VALUES` excludes Zalo.

Manual procedure (≤ 0.5 day, no product code):

1. On a dev OA with **every webhook event enabled**, log the raw webhook bodies.
2. Open `https://zalo.me/{oa_id}?dynamin_param=gclid:TEST123,campaignid:1`
   - as a **non-follower**,
   - as a **follower**,
   - and via `zalo.me/{custom_url}` (the OA's custom URL).
3. For each case record the webhook event name(s) and the exact field that
   carries the value, or the literal word "none".
4. Save the raw body of each case as a fixture in this document.
5. If the result is "none", ask Google's CTM contact (`ctm-ads@google.com`).

Open question for Google's CTM contact: **how is the Zalo URL built and how is
the click id supposed to reach the advertiser?** In particular, which webhook
event and field should carry `dynamin_param`, whether it is delivered at all for
non-followers, and whether the parameter name is really `dynamin_param`.

Only after a passing spike should Zalo be added: one `GOOGLE_ADS_CHANNEL_VALUES` value
plus one capture call in `integrations/zalo` (plan D3).
