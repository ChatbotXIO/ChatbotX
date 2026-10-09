# Implementation Plan: Google Ads Click-to-Message conversion tracking (`googleAds`)

Status: **implemented with notes (P0-P8 code and docs written; migration generated, not applied; Zalo spike not performed). See `docs/google-ads-conversion-tracking.md` for the as-built description.**

## As-built deviations (read first)

The sections below are the original plan. Where they differ, the code and `docs/google-ads-conversion-tracking.md` win:

- **Separate `googleAds` platform credential (instead of `google.adsDeveloperToken`):** Google Ads has its own OAuth app: `googleAdsCredentialSchema` = `{ clientId, clientSecret, developerToken }` (all required; public projection = `clientId` only), registered as `CONNECTION_REGISTRY.googleAds` credential type `googleAds`, with its own admin card (secrets write-only, blank keeps the stored value) and callback URL. Why: the sensitive `adwords` scope requires its own Google OAuth verification, which must not affect (or be blocked by) the Google Sheets / Calendar / sign-in app. The optional `google.adsDeveloperToken` field, its "Remove" action and the `hasGoogleAdsDeveloperToken` service method were never released and were removed (no data migration). Everywhere below that says `google.adsDeveloperToken` / "platform `google` credential" for Google Ads, read `googleAds` credential (`developerToken`, `clientId`, `clientSecret`); `GoogleAdsConfig.developerToken` replaces `adsDeveloperToken`.
- **Error parsing and 403 classification:** Google error bodies are parsed in both shapes, `{error}` and the streaming `[{error}]` (`searchStream` wraps errors in an array). A bare/unrecognised 403 maps to `permission_denied`, not `developer_token_not_approved` (only `DEVELOPER_TOKEN_*` reasons blame the token). Candidate customers failing with `CUSTOMER_NOT_ENABLED`/`CUSTOMER_NOT_FOUND` are inactive accounts and are skipped (info log), so an all-inactive user reports `no_candidates`.
- **Upload method and optional token (addendum):** a second, opt-in transport (legacy `UploadClickConversions`, `adwords` scope only), event-level `uploadMethod` pinning and an optional developer token were added after this plan; see `docs/plans/2026-10-07-google-ads-upload-method.md` (as-built in section 6) and the "Upload methods" section of `docs/google-ads-conversion-tracking.md`. Where this plan says delivery is Data Manager only or the token is required, the addendum wins.
- **Project-level API access (developer tokens sunset 2026-09-09):** access levels now belong to the Google Cloud project that owns the OAuth client. A project without production access gets `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (older API versions: `ACTION_NOT_PERMITTED` as an `authorizationError`), classified as the connect cause `project_not_approved`; `listCandidates` throws it instead of skipping the customer or returning no accounts. The developer token is optional; the `developer_token_*` causes remain. See the doc's "Google Ads API access" section.
- **Channel is `text`, not a pgEnum:** `GoogleAdsConversionEvent.channel` is `text().$type<ChannelType>()` (like `ContactInbox.channel`); there is no `googleAdsChannel` enum. The channel list is the single `GOOGLE_ADS_CHANNEL_VALUES` in `packages/utils/src/google-click.ts` (`googleAdsChannels`), re-exported by `partials/google-ads.ts`; adding a channel = one value + one capture call (`consumeGoogleClickRef` / `extractInvisibleGoogleClick`).
- **`unsupportedChannel` outcome:** `recordGoogleAdsConversion` is the one channel gate and returns `unsupportedChannel` (mapped to `google_ads_unsupported_channel`); the flow step has no duplicate pre-check, and the builder labels channels with the app-wide inbox label (no `googleAds.events.channel.*` keys).
- **Duplicate recovery** respects `MAX_REDRIVE_GENERATIONS`.
- **Poll classification:** `classifyRequestStatus` accepts exactly one `requestStatusPerDestination` entry; zero or several entries, or an unrecognised status, are `unknown`. The destination is a string in Data Manager responses, so the planned `operatingAccount.accountId` / `productDestinationId` matching is not done (one event is sent per request).
- **Poll execution:** four events at a time, drained until a short page / 5-minute budget / 50-page ceiling; a failed reschedule is logged, never fatal. The housekeeping cron always runs `sweepStranded` even when the poll threw, then rethrows.
- **Sweeper:** stale `sending` leases and stale `pending` rows come from two separate queries (`listStranded`), and a pending row with a live job is touched so it rotates out of the window. The unused `after` keyset cursor on `listDueForProcessingCheck` and `findByIntegrationId` were removed.
- **Setup sync:** daily cron plus the manual Sync action only. There is no on-fetch re-sync when `conversionActionsSyncedAt` is older than 24 h.
- **Finish-setup** is folded into the pick and sync actions (`refreshSetup`); there is no separate `finish-setup` action. A reconnect/single-account session that completes in the picker calls the Sync action to clear a stale `setupError`.
- **Daily job** calls `refreshSetup` (the SDK refresh marks the Connection `needs_reauth` when the grant is revoked) instead of `connectionService.verify`.
- **Delivery** logs the Data Manager `fieldWarnings` at `warn`, sanitized and without the click id.
- **Developer token** is used only by `refreshSetup` (connect, manual sync, daily sync) and the "configured" check; delivery, polling and validate use the Data Manager API without it.
- **Teardown:** no Google Ads teardown runs on trial/owner teardown. `allIntegrations` is only consulted per inbox channel, and Google Ads has no inbox; `teardownExpiredTrial`'s `disconnect` level keeps the Google Ads connection and refresh token. The grant stays, and every Google-calling path (send job, poller context, sweeper, daily sync) is skipped by `withBlockedOwnerGuard`. On purge the workspace delete cascades and removes the rows. `disconnectWorkspaceIntegrations` has no `googleAds` entry either: Google Ads is a Connection-engine integration whose disconnect lives in `packages/connections` (business cannot depend on it), like Google Sheets and Calendar.
- **Connection verify** is an OAuth token check only (access-token resolution plus token info). It does not call Google Ads; Ads reachability and developer-token problems surface through the daily `refreshSetup`.
- **Degraded connections** send like `connected`: only `needs_reauth` defers delivery and polling.
- **`getIntegration`** is membership-only (any workspace member can read the setup summary); mutations keep their own permission checks.
- **`acceptedCustomerDataTerms = false`** is a setup warning, not a readiness blocker: Google rejects the upload at processing time with a specific reason, which is recorded on the event.
- **Transient processing failure** (`INTERNAL_ERROR`, `TOO_RECENT_CLICK`) is redriven as a new generation after 6 h (`PROCESSING_REDRIVE_DELAY_MS`); re-authorization deferrals stay at 1 h (`REDRIVE_DELAY_MS`).
- **Processing writes are fenced** on the polled `requestId` and `attempt`, so a stale poll cannot overwrite a newer generation; a lost fence is logged (event id and generation only).
- **Data Manager response field** is `eventsIngestionStatus` (per the REST `RequestStatusPerDestination` reference); the earlier `ingestEventsStatus` spelling is still accepted.
- **Auth failures in delivery:** only an `AuthException`, or an `AuthRefreshException` whose origin is an `AuthException` (terminal refresh), defers as `needs_reauth`; a transient refresh outage goes through the normal BullMQ retry.
- **Partial OAuth consent is rejected** (`scope_missing`, review fix): the exchange fails unless both `adwords` and `datamanager` were granted, and `verify` flags a stored connection lacking one. `connectFailureCauses`/`connectErrorQueryCodes` gained `scope_missing` and the exchange failure now carries the cause like a listing failure does.
- **Data Manager login account** is resolved by `resolveLoginAccountId` (not always `loginCustomerId ?? customerId`): when the conversion customer differs from the connected account, the login account is `loginCustomerId ?? conversionCustomerId`, because the connected account has no write access to another account's actions.
- **gbraid vs `ONE_PER_CLICK`** is refused at record time (`incompatibleAction`, `google_ads_incompatible_action`) instead of failing at Data Manager processing; the UI notes it on `ONE_PER_CLICK` actions without disabling them.
- **External attribution** (`attribution_model = EXTERNAL`) is cached as `attributionModel` and refused (`unsupportedAction`, `google_ads_unsupported_action`); the cache entry gained an optional field (jsonb, zod/TS only, no migration).
- **Candidate listing** rethrows a transient expansion/lookup failure when no candidate was found (retryable `connectionProviderUnavailable`) instead of reporting `no_candidates`; partial results keep the candidates.
- **Data Manager error details:** `BadRequest.fieldViolations` are parsed (<= 5 entries, <= 200 characters each) into the exception details, sanitized with the click id as a secret. The sanitizer no longer treats a field path ending in `.gclid` as a key/value secret.
- **Tests:** the real-HTTP wire-contract tests are split into `wire-google-ads`, `wire-data-manager` and `wire-connect` (shared `__tests__/helpers/wire-server.ts`). No real-BullMQ tests were written; the queue is mocked in the business and worker tests. The Zalo spike was not performed.

> Naming: in this repo **"CTM" already means Meta Click-to-Messenger** (`docs/ads-conversion-tracking.md`, `fields.adReferral.ctm`). The Google feature is `googleAds*` in code and "Google Ads (Click-to-Message)" in UI. Never use `ctm` identifiers for it.

## 0. Mandatory implementation rules (apply to every phase, every PR, every implementer)

A task is not done until each applicable rule is verifiably satisfied.

| # | Rule | How it is enforced / verified in this repo |
|---|---|---|
| R1 | **Check official docs and the existing implementation first; never guess.** | Every Google API shape below cites developers.google.com — re-verify at implementation time (`validateOnly` dry-runs, the live `eventSource` enum, request-status fields). Every repo pattern cites a file:line to copy from. Read the `.agents/skills/*` listed in CLAUDE.md before each phase (`feature-scaffold`, `orpc-api`, `business-data-access`, `drizzle-database`, `worker-development`, `flow-step-development`, `builder-ui-i18n`, `integration-channel`, `contact-filter`, `security-review`, `testing-workflow`, `reliability-concurrency`). |
| R2 | **Follow existing architecture, conventions, naming, style.** | Chain `action / API handler → service (@chatbotx.io/business) → repository → DB`; Connection engine for OAuth; `Integration` SDK contract; Biome via `pnpm fix`; names mirror siblings. `invariant-guard` agent runs after each phase's edits. |
| R3 | **Clean, modular, maintainable; no deep if/else nesting.** | Functions < 50 lines, files < 800 lines; early returns; the delivery pipeline is a numbered sequence of small guards (§8), not nested conditionals. |
| R4 | **Shared files stay channel-agnostic.** | Channel behaviour lives in each channel's integration package (WhatsApp decoder call, Messenger ref parser) and in enum-keyed maps. Shared worker/business code consumes only `MessageReferral` keys and `googleAdsChannels.safeParse`. |
| R5 | **Multi-case logic → enums, config objects, handler maps; not scattered conditions.** | pgEnum + zod enums for every state (§5.2); category → dedup strategy map; processing-status → transition map; status/error → i18n via exhaustive `Record<…>` with `satisfies` (a missing case fails to compile). |
| R6 | **Reuse or improve existing functions; no duplicate logic.** | Reuse `templateOrStatic`/`optionalTemplateOrStatic`, `resolveContactVariablesDeep`, `withBlockedOwnerGuard`, `enqueueIntegrationJob` + `adsConversionRetryOptions`, `logProviderError`, `probeVerify`/`isGoogleRevokedError`/`googleOAuthConnection`, `buildContext`/`runAction`, `startConnect`/`startReconnect`, `connectionService.*`, `DisconnectIntegrationDialog`, `SettingRow`. The one shared-engine change (`completeReconnect` applies `candidateToConfig`) is a fix, not a fork. |
| R7 | **Business logic in the business/service layer.** | Delivery, dedup, readiness, setup, token resolution, housekeeping live in `packages/business`; worker handlers are thin guards; builder actions authorize and call services; repositories are raw. |
| R8 | **Design patterns only where they pay off.** | Used: fenced lease (claim token), generation counter for redrives, handler/strategy maps. No speculative abstractions; Meta pipelines untouched. |
| R9 | **No `any`; explicit, safe types.** | Biome `noExplicitAny`; zod-inferred types for every external payload (Google responses parsed with zod before use); `unknown` + narrowing at boundaries; `pnpm --filter <ws> check-types` on every touched workspace. |
| R10 | **Clear, descriptive names following conventions.** | camelCase functions/vars, PascalCase types/components, `is/has/should` booleans, `use*` hooks, kebab-case files; i18n keys under `googleAds.*`. |
| R11 | **No code smells, duplication, dead code, clutter.** | `pnpm check:unused` (knip) + `pnpm check:circular`; no commented-out code; server code uses the structured logger with key `err`, never `console`. |
| R12 | **Easy to extend without unnecessary abstraction.** | Adding a channel = one `googleAdsChannels` value + one capture call in that channel's integration; adding a status = one enum value + one map entry (compile-enforced). |
| R13 | **No duplicated DB/query logic; reuse repositories/query builders; no ad-hoc raw SQL.** | New access only via repositories in `packages/database/src/repositories/*`; `googleClickPredicate()` shared by filter and attribution; `insertIgnoreDuplicate` targets the unique index; expression SQL only inside repositories/queries with drizzle `sql` templates. |
| R14 | **Prevent SQL injection; parameterized queries only.** | Drizzle builder / `sql` tagged templates; identifiers from input (customer ids, click ids) are zod-validated (digit-only / `CLICK_ID_RE`) before reaching GAQL or SQL. |
| R15 | **Preserve backward compatibility.** | Meta CAPI / `AdsConversion*` / `MetaCapiEvent` code paths untouched; `googleCredentialSchema` gains only an optional field (existing encrypted rows still parse; Sheets/Calendar unaffected); `ContactInboxReferral` gains optional keys; `compactReferral` changes only for the six Google keys; new `IntegrationType` added with the full cascade so exhaustive records still compile; consumers deployed before producers. |
| R16 | **High-traffic system: concurrency, races, idempotency, duplicates, retries, DB load, external-API failures, N+1, unnecessary calls.** | Fenced lease + CAS transitions; generation-suffixed jobIds (never re-add the same id); deterministic `transactionId` + unique index; BullMQ retries only for retryable errors; 6 h delay computed once at enqueue; housekeeping keyset-paginated with bounded concurrency and backoff; WhatsApp decoder gated by a regex pre-check; contact filter is an EXISTS over the contact's inboxes (no new index on `ContactInbox`); Google calls outside DB transactions; one `buildContext` per delivery; no new per-message DB lookups on the inbound hot path. |
| R17 | **Handle failure paths and edge cases.** | Each phase lists its failure cases: developer token missing, revoked grant, conversion customer inaccessible, data terms not accepted, action disabled/unknown, too-recent/expired click, Google 4xx/5xx/429, async processing FAILED/unknown/timeout, stranded jobs, stale claims, duplicate webhooks, malformed invisible payloads, Japanese IVS text, structured ref without id, support sessions, blocked owners, trial-expired workspaces. |
| R18 | **Tests cover all affected cases, regressions, edge cases and failure paths.** | TDD per phase (tests listed first in §12); unit + DB-backed (`__tests__/integration`) + real-BullMQ tests; regression tests asserting Meta paths unchanged; adversarial tests (click id / token never leaks into logs, error log, satellite auth, public resources); 80%+ coverage on new modules. |
| R19 | **Stay focused on this task; no unrelated refactors or speculative improvements.** | Known adjacent issues are recorded in §14 as follow-ups, not fixed here. |
| R20 | **Accurate, focused reviews; minimal review/fix cycles.** | Per PR: one consolidated review (`invariant-guard` + `code-reviewer`/`typescript-reviewer` + `security-reviewer` where auth/credentials/webhooks are touched, run together), all findings fixed in one pass, one confirmation pass. Findings cite file:line. |

Definition of done per phase: tests written first and green; `pnpm lint`; `pnpm --filter <touched ws> check-types`; `pnpm fix`; `invariant-guard` clean; R1–R20 checked against the diff; `db:migrate` never run without owner approval.

## 1. Context

Google "Message Ads" (Search / PMax) send a user from a Google ad straight into WhatsApp, Messenger or Zalo. Google counts "Conversation Started" itself; every downstream outcome (qualified lead, purchase) only exists inside the chat. AhaChat signed Google's Message Ads partner SOW (§5.5): store the click id + ad identifiers and report advertiser-named conversions (click id, timestamp, value, currency, conversion name) into the advertiser's Google Ads account.

v1 (Laravel `chatbotai` + Vue `ahachat-fe`): WhatsApp-only decode, per-bot Google OAuth, one flow block ("Send Click Conversion": pick customer + existing conversion action + value/currency) calling `UploadClickConversions` synchronously, no dedup/retry/log, tokens stored unencrypted. v2 keeps v1's product shape (OAuth per advertiser, pick an existing action, flow block) and adds the production infrastructure v1 lacked.

### 1.1 Facts from Google's partner documents (`/Users/phanhung/Documents/Google CTM`)

| Channel | How the click id arrives |
|---|---|
| WhatsApp | Invisible Unicode (Variation Selector Supplement, code point `0xE0100 + i`, i = index into `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_{}'",:-`, 70 chars) embedded in the starter message; decodes to JSON `{"gclid"\|"gbraid":"…","campaignid":123,"adgroupid":456,"adid":789}`. May sit at the start or inside the text. |
| Messenger | `<m.me url>?ref=gclid:<id>,k1:v1,…` or `ref=gbraid:<id>,…` (current spec). Legacy raw `ref=<gclid>` is out of scope. |
| Zalo | `<oa url>?dynamin_param=gclid:<id>,…` (Google's spelling). Zalo's public docs document **no** webhook field carrying it (`follow.source ∈ oa_profile\|message_invite\|social_plugin`; `user_send_text` has only `message.{msg_id,text,attachments}`, the same shape as `integrations/zalo/src/schema/webhook.ts`). → spike only. |

Exactly one of gclid / gbraid per click (gbraid = iOS ATT). Advertiser CIDs must be allowlisted by Google (gTech Item 1) — a manual ops step with the Google partner contact; v1 had no code for it. The gTech doc recommends OAuth2 with a user who has access to the advertiser's Google Ads (this plan follows it).

### 1.2 Facts from Google developer docs (verified 2026-10-05)

- **`ConversionUploadService.UploadClickConversions` is closed to new integrations** since 2026-06-15 for developer tokens without prior upload history → uploads go through the **Data Manager API**.
- **Data Manager API** `POST https://datamanager.googleapis.com/v1/events:ingest` (scope `https://www.googleapis.com/auth/datamanager`, no developer token). Request-level validation is atomic; **processing is asynchronous**: response `{requestId, fieldWarnings[]}`, outcome via `GET /v1/requestStatus:retrieve?requestId=` → `requestStatusPerDestination[]` (ordered like `destinations[]`; each has the destination, `requestStatus ∈ SUCCESS|PROCESSING|FAILED|PARTIAL_SUCCESS`, `eventsIngestionStatus{recordCount}`, `errorInfo{errorCounts[{reason,recordCount}]}`, `warningInfo`). `operatingAccount` **must be the Google Ads conversion customer** (`customer.conversion_tracking_setting.google_ads_conversion_customer`); `loginAccount` = the account the credential's user is a user of (the customer itself or a parent manager). Re-sending an existing `transactionId` for the same action = adjustment. Conversion action must be `type = UPLOAD_CLICKS`. `eventSource` enum includes `MESSAGE`. Google Cloud: the OAuth client's project needs `roles/serviceusage.serviceUsageConsumer` for the caller.
- **Google Ads API v25 REST** (`developer-token` + optional `login-customer-id` = the manager through which the user reaches the customer) for: `customers:listAccessibleCustomers`, GAQL `searchStream` (`customer`, `customer_client`, `conversion_action`). Developer token belongs to AhaChat's MCC (Standard access, confirmed) and is used together with the advertiser's OAuth token.
- Timing rules (Google authoritative, ours advisory): clicks < 6 h old are rejected (`TOO_RECENT_EVENT`); conversion time must be after the click; click ≤ 90 days and within the action's click-through window; gbraid requires a `MANY_PER_CLICK` action.
- Conversion counting guidance: "One" for leads, "Every" for purchases (support.google.com/google-ads/answer/3438531).
- Consent (`adUserData`) "highly recommended"; omitted this phase (VN market).

### 1.3 How peers do it

Blip, Botmaker: "Sign in with Google → pick account → map bot event → conversion action" (same as this plan). Wati: Google-whitelisted account, `google_ad*` attributes, Meta-style "conversion templates". Infobip: Chat-ID protocol + S3/API. google/wci: protocol pattern. No open-source invisible-Unicode decoder exists. Common: automation-driven triggers, transaction-id dedup, per-conversion status log.

## 2. Decisions and scope

| # | Decision | Why |
|---|---|---|
| D1 | **Upload via Data Manager API** `events:ingest`, one event per request (= one BullMQ job per event). Google Ads API v25 REST only for account discovery and listing conversion actions. Thin `ky` REST client; no `google-ads-api`/`google-ads-node` npm (10–126 MB). | UploadClickConversions closed; async model needs a status poller. |
| D2 | **Auth = per-advertiser Google OAuth on the Connection engine** (`packages/connections`, `CONNECTION_REGISTRY`, `ConnectSession`, store bindings). `integrations/google-ads` is an `Integration` with `connection: { kind:"integration", strategy:"oauth_redirect", multiAccount:true }` reusing `googleOAuthConnection` + the platform `google` OAuth credential; scopes `adwords` + `datamanager` + `openid email`; `listCandidates` = the Google Ads customers the signed-in user can access (direct or through a manager); `describe().sourceId = customerId`; `candidateToConfig` → `{customerId, loginCustomerId, descriptiveName, currencyCode}`; `refreshAuth` copied from Google Calendar; `isRevokedTokenError = isGoogleRevokedError`. Developer token = new optional field `adsDeveloperToken` on the platform `google` credential (tenant-aware via `resolveForOwner`). | Owner decision (gTech recommendation, v1 model). Engine provides OAuth session, candidate list, encrypted session auth, token refresh + persistence, `needs_reauth`/reconnect/verify/disconnect, "already connected elsewhere" check, APIs. |
| D3 | **Channels: WhatsApp + Messenger.** Zalo = spike only; `googleAdsChannels` is `whatsapp\|messenger` until the spike passes. | Zalo carrier unknown. |
| D4 | **Producers: flow step + trigger action `sendGoogleAdsConversion`** (v1's flow block + its Trigger twin). No rule engine. | Owner: same as v1. Meta's identical rule engine is hidden/unused. |
| D5 | **Conversion actions: select an existing `UPLOAD_CLICKS` action** listed from the conversion customer. No auto-created actions. UI links to Google's "create an offline import conversion action" help. | Owner: same as v1. |
| D6 | **One `IntegrationGoogleAds` satellite row per workspace** (engine `duplicateConstraint` on `workspaceId`); the `Connection` row owns connection status; the satellite owns Google Ads setup state. A customer id active in another workspace is non-selectable (engine `other_workspace`). Switching accounts = disconnect + connect. **pgEnum** for every fixed string set; cross-column CHECKs. | Engine semantics; v1 was also one account per bot. |
| D7 | **Attribution on `ContactInbox.referral`**, flat keys `gclid`, `gbraid`, `googleCampaignId`, `googleAdGroupId`, `googleAdId`, `googleClickReceivedAt` (time of the inbound message that carried the id — not the click time). No raw decoded JSON retained. No new `ContactInbox` indexes. Meta `source`/`type` untouched. **Policy: per provider family — a newer Google click overwrites older Google keys (gbraid clears gclid and vice-versa); non-Google referrals never clear Google keys; Google never touches Meta keys. Cross-platform double attribution accepted.** | Same place/merge semantics as `ctwaClid`; no index lock on the hottest table. |
| D8 | **Dedup by conversion-action category**, never from wall-clock time: lead-like categories (`QUALIFIED_LEAD`, `CONVERTED_LEAD`, `SUBMIT_LEAD_FORM`, `CONTACT`, `SIGNUP`, `BOOK_APPOINTMENT`, `REQUEST_QUOTE`, `IMPORTED_LEAD`) → **once per click per action** (`transactionId = gads-{conversionActionId}-{sha256(clickId).slice(0,24)}`, emulating Google's "One" counting because gbraid forces the action to "Every"); `PURCHASE` and others → per occurrence with a stable id: `gads-{conversionActionId}-order-{orderId}` when the step/action supplies an `orderId` template, else `gads-{conversionActionId}-{scope}-{scopeId}-inbox-{ciId}-msg-{triggerMessageId}` when the execution has a triggering inbound message id, else once-per-click with a `warn` (`noStableOccurrenceId`). | Google only dedups identical gclid+action+time. |
| D9 | **Delivery state machine with a fenced lease**: `pending → sending (claimToken) → sent (requestId) → processed \| failed`, plus `skipped_no_account`, `skipped_expired`. `event.attempt` is our generation counter (distinct from BullMQ `attemptsMade`); every redrive increments it and enqueues `google-ads-send-{id}-a{attempt}`; cap 30. Delivery lives in business; the worker handler is a thin guard. Token refresh/revocation is owned by the SDK (`runAction` → `refreshAuth` → `authStore.save`, or `markOffline` → `needs_reauth`). | Idempotent under BullMQ retries, duplicate deliveries and sweeper redrives. |
| D10 | **Timing**: send delayed until `googleClickReceivedAt + 6h`; advisory skip when `occurredAt − googleClickReceivedAt > min(90d, action lookback)` or `now − occurredAt > 90d`; Google processing status is authoritative. | — |
| D11 | **UI**: Settings → Integrations → "Google Ads" (connect via engine + account picker, setup card, conversion actions card, event history with retry, "Validate request"), conversation badge, contact filter `fromGoogleAd`, flow step + trigger action, Google platform-credential form gets `adsDeveloperToken` + the new callback URL. No edition gating; "not available" state when the owner's `google` credential lacks `adsDeveloperToken`. superAdmin via the settings layout guard; **support sessions (`isSupportSession`) rejected** for connect / reconnect / pick / cancel / disconnect / retry / validate. | Mirrors CAPI surfaces; security. |
| D12 | Consent omitted (hook point `// TODO(consent)`); `eventSource: "MESSAGE"` fixed, no fallback. Satellite `auth` jsonb stays plaintext like every other engine satellite (`IntegrationGoogleSheet`/`Calendar`) — therefore **the developer token is never written into satellite `auth`**: it travels only inside the encrypted `ConnectSession.encryptedAuth` during connect (consumed by `listCandidates`, stripped from every candidate auth) and is otherwise resolved at runtime from the encrypted platform `google` credential. | — |

**Out of scope (follow-ups):** rule engine, auto-created conversion actions, public API/CLI/MCP exposure, legacy Messenger raw `ref=<gclid>`, contact system field `google_click_id`, date-range contact filter, admin CSV export (replaced by a service method + runbook query), consent, Zalo capture (after the spike), MCC-link alternative.

## 3. Prerequisites and owner inputs

| # | Item | Status |
|---|---|---|
| 1 | Developer token (Standard access) of AhaChat's MCC | Confirmed; stored as `google.adsDeveloperToken` platform credential field (per tenant owner). |
| 2 | Google OAuth app | Add scopes `https://www.googleapis.com/auth/adwords` and `https://www.googleapis.com/auth/datamanager` to AhaChat's existing Google OAuth app and **pass Google's OAuth verification for these sensitive scopes** (until then only test users can consent, and refresh tokens of an app in "Testing" expire after 7 days). Allow-list the redirect URI `/integrations/google-ads/callback`. **Critical path for E2E, not for development — start immediately.** |
| 3 | Google Cloud | Enable Google Ads API + Data Manager API on that project; grant `roles/serviceusage.serviceUsageConsumer`. |
| 4 | CID allowlisting with Google | Manual ops step. Plan provides `integrationGoogleAdsService.listConnectedCustomerIds()` + a runbook SQL; the connect UI states "attribution starts after Google confirms your Customer ID". |
| 5 | Zalo carrier field | Unknown; spike in P8 + ask Google's CTM contact (ctm-ads@google.com) how the Zalo URL is built. |
| 6 | One Google Ads account per workspace; a CID active in another workspace is not selectable | Decided (engine behaviour). Say so if a CID must be shareable within a tenant. |
| 7 | "Validate request" is a configuration check (`validateOnly`), not an end-to-end test | Decided. |

## 4. Architecture

```
INBOUND WEBHOOK
 WhatsApp text (invisible U+E0100..E0145) ─┐ integrations/whatsapp  pre-check → decode longest run → strip only that run → referral{gclid|gbraid,…}
 Messenger referral.ref "gclid:…"           ─┘ integrations/messenger parse structured ref → referral{…}; ref:=null (consumed, so no runRef job)
        ▼ apps/worker received-message.ts → Contact.source=ads (Google checked first) → updateTracking (jsonb ||, Google keys null-preserving)
 ContactInbox.referral {gclid, gbraid, googleCampaignId, googleAdGroupId, googleAdId, googleClickReceivedAt}

CONNECT (Connection engine)
 Settings "Connect Google Ads" → server action startConnect({workspaceId, provider:"googleAds", config:undefined, redirectUrl: ABSOLUTE settings URL, ownerId: resolvePlatformOwnerId(...), actor:{actorUserId}})
   → open_url (Google consent: adwords + datamanager + openid email, offline, prompt=consent)
   → generic callback /integrations/google-ads/callback → completeAuthorization (exchangeCode carries adsDeveloperToken in the ENCRYPTED session auth only)
   → listCandidates (Ads API: accessible customers, expanded through managers; token stripped from candidate auth) → session awaiting_selection
   → callback redirects to returnUrl (absolute settings page; the engine never appends a session id) → picker looks up the workspace's latest in-flight googleAds session
   → picker polls getConnectSession → user picks customer → googleAds-specific action (superAdmin + no support session) → connectionService.connectTargets
   → Connection{connected, sourceId=customerId} + IntegrationGoogleAds{auth (no developer token), customerId, loginCustomerId, …}
   → post-connect setup (business, developer token from platform credential): resolveConversionCustomer → list UPLOAD_CLICKS actions → satellite setup columns

PRODUCERS (business: googleAdsConversionService.recordConversion)
 flow step / trigger action sendGoogleAdsConversion → gate: inbox has gclid|gbraid → account ready → action in cache → transactionId (D8) → insertIgnoreDuplicate → enqueue
        ▼ GoogleAdsConversionEvent(pending) — job google-ads-send-{id}-a{attempt}, delay = max(0, googleClickReceivedAt+6h−now)
        ▼ worker thin handler → withBlockedOwnerGuard → googleAdsConversionService.deliver(...)
   claim (pending→sending) → Connection active & snapshot matches → expiry (advisory) → 6h
   → ctx = buildContext({integrationType:"googleAds", integration: row}) → integrationGoogleAds.runAction("ingestEvent") [SDK refreshes/persists token]
   → sending→sent{requestId}; terminal 4xx → failed + logProviderError("google-ads"); AuthException/needs_reauth → release, re-enqueue 1h (bounded); 429/5xx → retry
        ▼ cron googleAdsHousekeeping (10 min): poll requestStatus (destination-matched) → processed|failed|unknown w/ backoff, 7-day timeout; sweep stranded; daily action-cache re-sync + connection verify
```

## 5. Data model (`packages/database`)

### 5.1 Referral extension (jsonb; no column migration)
- `src/schema/contact-inbox.ts` `ContactInboxReferral` (L30–45): add `gclid?`, `gbraid?`, `googleCampaignId?`, `googleAdGroupId?`, `googleAdId?`, `googleClickReceivedAt?` (`string | null`). No indexes.
- `packages/sdk/src/lib/shared/index.ts` `MessageReferral` (L38): same keys.
- `GOOGLE_CLICK_REFERRAL_KEYS` from `packages/utils/src/google-click.ts`; `compactReferral` (`packages/business/src/contact-inbox/service.ts:188`) keeps explicit `null` only for these keys; all other keys behave as today.

### 5.2 Enums (`src/partials/google-ads.ts`, zod + `pgEnum` pairs as in `ads-conversion-event.ts`) — 6 enums
`googleAdsChannel = whatsapp|messenger`; `googleAdsEventSource = flowStep|triggerAction`; `googleAdsClickIdType = gclid|gbraid`; `googleAdsEventStatus = pending|sending|sent|processed|failed|skipped_no_account|skipped_expired`; `googleAdsProcessingStatus = processing|success|partial_success|failed|unknown|timed_out`; `googleAdsFailureStage = delivery|processing|timeout`.

### 5.3 Tables (no `.default()` on new columns; explicit inserts — AGENTS.md schema-default parity)

**`IntegrationGoogleAds`** (`schema/integration-google-ads.ts`) — engine satellite, template `integration-google-calendar.ts`. The table name is fixed: `makeAuthStore` derives `"Integration" + PascalCase(integrationType)` (`packages/business/src/integration-context/auth-store.ts:14`).
- `workspaceId` FK cascade; `integrationId` FK → `Integration` cascade; `auth` jsonb NN (`GoogleAdsAuthValue`, plaintext per repo convention)
- Candidate config (written by the engine via `candidateToConfig` + `configColumns`): `customerId` text NN (10 digits), `loginCustomerId` text (manager used to reach the customer; null = direct), `descriptiveName` text, `currencyCode` text
- Setup columns (written by business after connect / on sync): `conversionCustomerId` text (nullable until resolved), `acceptedCustomerDataTerms` boolean (nullable = not checked), `conversionActions` jsonb (nullable = never synced) `GoogleAdsConversionActionCacheEntry[]` = `{id, resourceName, name, category, status, countingType, clickThroughLookbackWindowDays}` (includes disabled actions for diagnostics), `conversionActionsSyncedAt`, `setupError` text (code: `conversion_customer_inaccessible|customer_data_terms_not_accepted|sync_failed|developer_token_missing`), `setupErrorAt`
- Unique `IntegrationGoogleAds_integrationId_key`; unique `IntegrationGoogleAds_workspaceId_key` (= engine `duplicateConstraint` → `connectionAlreadyConnected`)
- Readiness (derived, never stored): `Connection.status ∈ connected|degraded` AND `conversionCustomerId IS NOT NULL` AND `conversionActionsSyncedAt IS NOT NULL`
- Relations file via `defineRelationsPart` + **`relations/index.ts` two edits** (import + spread); `types.ts` `IntegrationGoogleAdsModel`

**`GoogleAdsConversionEvent`** (`schema/google-ads-conversion-event.ts`)
- `workspaceId` FK cascade; `integrationGoogleAdsId` FK **set null**; `contactInboxId` FK **set null** (history survives contact deletion)
- Snapshots at insert: `customerId`, `loginCustomerId`, `conversionCustomerId`, `conversionActionId` NN, `conversionActionName`, `conversionActionCategory`, `lookbackWindowDays` int
- `channel`, `source`, `scopeId` NN; `clickIdType` NN, `clickId` NN, `googleClickReceivedAt` NN, `occurredAt` NN; `value` numeric, `currency`, `orderId`, `transactionId` NN
- `status` NN, `attempt` int NN, `claimToken`, `claimedAt`, `requestId`, `sentAt`, `error` (≤ 1000, sanitized), `failureStage` pgEnum
- `processingStatus` pgEnum, `processingCheckedAt`, `processingAttempts` int NN, `nextProcessingCheckAt`, `processingDetail` jsonb (allowlisted `{requestStatus, recordCount, errorCounts[], warningCounts[]}`)
- Unique `(workspaceId, transactionId)`; indexes `(workspaceId, occurredAt)`, `(workspaceId, status)`, `contactInboxId`, `(status, nextProcessingCheckAt)`, `(status, claimedAt)`
- CHECKs: `status IN ('sent','processed') ⇒ requestId AND sentAt NOT NULL`; `status='sending' ⇒ claimToken AND claimedAt NOT NULL`; `processingStatus IS NULL OR status IN ('sent','processed','failed')`; `failureStage IS NULL OR status='failed'`; `(value IS NULL)=(currency IS NULL)`; `value IS NULL OR value >= 0`; `length(clickId) BETWEEN 10 AND 512`; `occurredAt >= googleClickReceivedAt`; `attempt >= 0`

### 5.4 Repositories (raw only; exported from `src/repositories/index.ts`)
- `integration-google-ads`: `findByWorkspaceId`, `findByIntegrationId`, `updateSetup({id, workspaceId, …})`, `listConnectedCustomerIds()`.
- `google-ads-conversion-event`: `insertIgnoreDuplicate` (conflict `[workspaceId, transactionId]`), `findByTransactionId`, `findWorkspaceEvent`, `claimForSending({id, workspaceId, attempt, claimToken})` (UPDATE … WHERE status='pending' AND attempt=$attempt RETURNING), `finishSending({…claimToken, to, …})` (CAS on `status='sending' AND claimToken=$token`), `releaseClaim({…claimToken, nextAttempt})`, `redrive({id, workspaceId, fromStatuses, expectedAttempt})` (→ pending, attempt+1, claimToken NULL), `listByWorkspace({status?, channel?, since?, until?, page, perPage ≤ 100})` → `{rows,total}`, `listDueForProcessingCheck({now, limit})` (ordered by `nextProcessingCheckAt,id`; the keyset `after` cursor was removed, handled rows move their `nextProcessingCheckAt` so re-querying from the start never revisits them), `listStranded({pendingOlderThan, sixHourGateBefore, sendingOlderThan, limit})` (two queries: `sending` ordered by `claimedAt`, `pending` ordered by `updatedAt`), `touchStranded(event)`.
- `contact-inbox/repository.ts`: `findGoogleClickAttribution({workspaceId, contactInboxId})` (join `Inbox` for workspace scoping; returns row only when gclid/gbraid not null), `findLatestGoogleClickInboxByContact({workspaceId, contactId})`.
- `connect-session` repository/service: `findLatestInFlightForWorkspaceProvider({workspaceId, provider})` (status ∈ `pending|authorized|awaiting_selection`).
- `queries/google-click.ts`: `googleClickPredicate()` = `(referral->>'gclid' IS NOT NULL OR referral->>'gbraid' IS NOT NULL)`; **not** added to `anyChannelAdConversationPredicate` (drives the Meta funnel).

### 5.5 Migration
`pnpm --filter @chatbotx.io/database make:migration add_google_ads_conversions` → one folder (latest existing: `20261004155651_add_target_claim_leases`): 6 enums, 2 tables, uniques, CHECKs, FKs; no `ContactInbox` DDL. Inspect the SQL; `db:check-drift` clean. **Never run `db:migrate`; wait for owner approval.** DB-backed tests in `packages/database/__tests__/integration/` (opt-in `test:db`): duplicate `transactionId`, CHECKs, uniques, FK set-null.

## 6. Package `integrations/google-ads` (`@chatbotx.io/integration-google-ads`)

Templates: `integrations/google-calendar` (connection block + `refreshAuth`), `integrations/messenger` / `integrations/instagram-facebook` (`multiAccount`, `listCandidates`, `candidateToConfig`), `integrations/meta-conversions` (ky client, exception with `retryable`).

```
package.json   deps: ky, zod, google-auth-library ^10.6.2 (OAuth2Client), @chatbotx.io/sdk, @chatbotx.io/utils, @chatbotx.io/logger; exports ".", "./apis/*", "./lib/*", "./schemas"
src/constants.ts   GOOGLE_ADS_SCOPES = [".../auth/adwords", ".../auth/datamanager", "openid", "email"]; GOOGLE_ADS_API_VERSION="v25"; GOOGLE_ADS_API_URL; DATA_MANAGER_API_URL;
                   GOOGLE_ADS_EVENT_SOURCE="MESSAGE"; CLICK_LOOKBACK_DAYS=90; TOO_RECENT_HOURS=6; LEAD_LIKE_CATEGORIES
src/schemas.ts     GoogleAdsConfig = Oauth2Config & { adsDeveloperToken?: string }   (platform `google` credential + redirectUrl)
                   GoogleAdsAuthValue = Oauth2AuthValue & { metadata: { scope?, accountId (google sub), email?, developerToken? (session-only), customerId, loginCustomerId: string|null, descriptiveName?, currencyCode? } }
                   zod: accessible customers, customer row, customer_client row, conversion action row, ingestResponse, requestStatusResponse
src/client.ts      getClient(config|auth) → OAuth2Client (copy integrations/google-sheets/src/client.ts)
src/lib/http-client.ts  two ky instances (ads, dataManager), retry 0; adsHeaders({accessToken, developerToken, loginCustomerId?})
src/exception.ts   GoogleAdsException {httpStatusCode, apiStatus, reason, retryable, requestId?, details[]}; retryable = 429|408|>=500|documented transient reasons;
                   401/invalid_grant → AuthException (SDK refresh path); messages never include Authorization, body, key material
src/lib/sanitize.ts  sanitizeGoogleAdsError(err, {secrets}) → {message, httpCode, reason}; redacts tokens, raw JSON, exact click ids
src/connection-auth.ts  addGoogleAdsIdentity(baseAuth, developerToken) → tokeninfo (sub, email) + metadata.developerToken — exists ONLY inside the encrypted ConnectSession
                        stripDeveloperToken(auth) → auth without metadata.developerToken (applied to every candidate auth)
src/apis/google-ads.ts
  listAccessibleCustomers({accessToken, developerToken}) → ids
  getCustomer({…, customerId, loginCustomerId?}) → {id, descriptiveName, manager, status, currencyCode, conversionCustomerId, acceptedCustomerDataTerms, conversionTrackingStatus}
  listClientCustomers({…, managerCustomerId}) → customer_client WHERE manager=false AND status='ENABLED' (level ≥ 1)
  listUploadClickConversionActions({…, conversionCustomerId, loginCustomerId?})
src/apis/data-manager.ts
  dataManagerIngestEvent({accessToken, loginAccountId, operatingAccountId, conversionActionId, event:{transactionId, eventTimestamp:Date, clickIdType, clickId, value?, currency?}, validateOnly?})
     body: destinations[{loginAccount:{accountType:"GOOGLE_ADS",accountId}, operatingAccount:{…}, productDestinationId}], events[{transactionId, eventTimestamp RFC3339 UTC, adIdentifiers:{gclid}|{gbraid}, conversionValue?, currency?, eventSource:"MESSAGE"}], validateOnly   // TODO(consent)
  retrieveRequestStatus({accessToken, requestId}) → parsed per-destination list
src/integration.ts
  const googleConnection = googleOAuthConnection<GoogleAdsConfig, GoogleAdsAuthValue>({ getClient, scopes: GOOGLE_ADS_SCOPES, mapAuth: … })
  connection: { kind:"integration", strategy:"oauth_redirect", multiAccount:true, configFields:[],
    authorizeUrl: googleConnection.authorizeUrl,
    exchangeCode: async (input) => addGoogleAdsIdentity(await googleConnection.exchangeCode(input), input.credential.adsDeveloperToken),   // missing token → non-retryable error → session fails `provider_error`
    listCandidates: async ({auth}) => accessible customers expanded through managers, deduped by customerId (direct access wins), managers excluded;
                    each = { sourceId: customerId, displayName: `${descriptiveName} (${formatCustomerId(customerId)})`, auth: stripDeveloperToken({...auth, metadata:{...auth.metadata, customerId, loginCustomerId, descriptiveName, currencyCode}}) }
    describe: (auth) => ({ sourceId: auth.metadata.customerId, displayName: …, authExpiresAt: auth.tokens.expiresAt }),
    candidateToConfig: (auth) => ({ customerId, loginCustomerId, descriptiveName, currencyCode }),
    verify: probeVerify(getCustomer(self), { isRevoked: isGoogleRevokedError }),
    isRevokedTokenError: isGoogleRevokedError }
  refreshAuth: copy of integrations/google-calendar/src/integration.ts:142-177 (refreshAccessToken; keep refreshToken; revoked → AuthException)
  disconnect: revokeToken(auth)
  actions: { resolveConversionCustomer, listConversionActions, ingestEvent, retrieveRequestStatus, validateIngest } — Ads-API actions take `developerToken` in props (resolved per owner by business; no auth-metadata fallback); Data Manager actions need none
__tests__/  connection-oauth (authorizeUrl state verbatim, exchangeCode, listCandidates expansion/dedup/manager-exclusion, candidateToConfig, describe; mirrors google-calendar/__tests__/connection-oauth.test.ts and instagram-facebook/__tests__/connection-oauth.test.ts:76-180),
            refresh-auth, http-client, exception, sanitize (adversarial echo of click id), data-manager body shape (RFC3339 UTC, gclid vs gbraid, validateOnly), google-ads GAQL strings,
            leak test: satellite `auth`, session targets and every public resource never contain `developerToken`
```

- Static imports only (tsdown). After scaffolding: `CI=true pnpm install --no-frozen-lockfile`; `pnpm check:circular`.
- **Registration cascade (all required):** `packages/database/src/partials/integration.ts` `integrationTypes += "googleAds"`; `packages/connections/src/registry.ts` `googleAds: fromIntegration(integrationGoogleAds, "googleAds", "google")`; `packages/business/src/connection/store-bindings.ts` `googleAds: makeWorkspaceIntegrationBinding({ table: integrationGoogleAdsModel, tableName:"IntegrationGoogleAds", integrationType:"googleAds", duplicateConstraint:"IntegrationGoogleAds_workspaceId_key", configColumns:["customerId","loginCustomerId","descriptiveName","currencyCode"] })`; `packages/channel-registry/src/registry.ts` `integrations.googleAds` (drives `allIntegrations`, the worker, purge and the callback guard); workspace deps on the new package in `packages/channel-registry`, `packages/connections`, `packages/business`, `apps/builder`, `apps/worker` (+ `apps/builder/next.config.ts` `transpilePackages` if google-sheets is listed there); `apps/builder/src/features/connections/lib/resolve-connect-credential.ts` `OAUTH_CALLBACK_SLUG.googleAds = "google-ads"`; `packages/utils/src/error-log.ts` provider `"google-ads"` + label (then `rg -n "meta-conversions|errorLogProviders" apps packages` and mirror every exhaustive map); `apps/builder/src/features/platform-credentials/google/google-settings.tsx` adds the `/integrations/google-ads/callback` URL and the `adsDeveloperToken` field. Run `rg -n "Record<IntegrationType" apps packages integrations` and fix every compile error.
- **Platform credential:** `googleCredentialSchema` += `adsDeveloperToken: z.string().optional()`; `googleCredentialUpdateSchema` += `adsDeveloperToken: z.string().trim().optional()`; the public projection does **not** include it — the admin card gets a derived boolean `hasAdsDeveloperToken` computed in the business layer from the decrypted credential. `updateGoogleSettingsAction` (`apps/builder/src/features/platform-credentials/google/update-google-settings.action.ts`) loads the existing decrypted credential and **preserves** the stored token when the field is omitted; clearing happens only through an explicit "Remove developer token" action. Optional field is backward-compatible with existing encrypted rows; Google Sheets/Calendar connect + callback keep working unchanged.
- **Engine fix shipped with P2** (shared code, tests in `packages/connections/__tests__/service.test.ts`): `completeReconnect` (`packages/connections/src/connect-session-flow.ts` ~L355/L416) passes `adapter.provider.candidateToConfig?.(reconnectAuth) ?? {}` as `extraConfig` instead of `{}`, so a reconnect refreshes `customerId`/`loginCustomerId`/`descriptiveName`/`currencyCode` when the user's manager route changed (today reconnect keeps stale config for every multi-account provider). Test: changed manager path → `loginCustomerId` updated.

## 7. `packages/utils/src/google-click.ts` (pure; export `./google-click` in `packages/utils/package.json`)

```ts
googleAdsChannels = z.enum(["whatsapp","messenger"]); GOOGLE_CLICK_REFERRAL_KEYS (6); GOOGLE_INVISIBLE_CHAR_SET (70 chars, asserted unique); BASE=0xE0100; END=BASE+70
INVISIBLE_RUN_RE = /[\u{E0100}-\u{E0145}]+/gu   (test asserts it is derived from BASE/END)
decodeInvisibleGoogleClick(text) → { payload: GoogleClickPayload|null, consumed:{start,end}|null }
   // regex pre-check; longest run first; map each code point to CHAR_SET[cp-BASE]; JSON.parse guarded; first run parsing to {gclid|gbraid} matching CLICK_ID_RE wins; ids number|string → String
stripConsumedRun(text, consumed)       // never strips unless a payload parsed (protects Japanese IVS text)
parseGoogleClickRef(ref) → payload|null   // "gclid:<id>,k1:v1" | "gbraid:<id>,…"; keys campaignid/adgroupid/adid case-insensitive; guarded decodeURIComponent
toGoogleClickReferral(payload, receivedAt) → six keys (unused click-id key = null, so a newer click clears the other id)
hasGoogleClick(referral); isLeadLikeCategory(category); buildTransactionId(...) (D8); formatCustomerId("1234567890") → "123-456-7890"
type GoogleClickPayload = { clickIdType:"gclid"|"gbraid"; clickId:string; campaignId?:string; adGroupId?:string; adId?:string }
CLICK_ID_RE = /^[A-Za-z0-9_-]{10,512}$/
```
Tests `packages/utils/__tests__/google-click.test.ts`: Google's two documented vectors (expected JSON `{"gclid":"ABC…9_"}` and `{"gclid":"ABC…z_","campaignid":123,"adgroupid":456,"adid":789}`) using both our encoder and the literal URL-decoded text from Google's test URLs; gbraid; mid-text run; malformed JSON → text unchanged; IVS text (`葛\u{E0100}`) untouched; multiple runs; boundary code points; ref variants (extras, URL-encoded, wrong case, empty id); transactionId builders; customer id formatting.

## 8. Business layer (`packages/business/src/`)

**`integration-google-ads/service.ts` — `integrationGoogleAdsService`** (mirrors `integration-google-sheet/service.ts` + `integration-facebook-ads/service.ts`):
- `findByWorkspaceId(workspaceId)` → satellite row + its `Connection` (`connectionRepository.findByIntegrationId`) + derived readiness; public resource never exposes `auth`.
- `finishSetup({workspaceId})` (after the picker's `connectTargets`, and daily from housekeeping): `buildContext` → `runAction("resolveConversionCustomer")` (probe that the conversion customer is reachable with this user's access; `conversionCustomerId`, `acceptedCustomerDataTerms`) → `runAction("listConversionActions", {conversionCustomerId})` → `updateSetup` in one tx; failures → `setupError` code (never a raw provider error to the UI).
- `syncConversionActions({workspaceId})` (manual; daily; and when `conversionActionsSyncedAt` is older than 24 h on settings/step-editor fetch).
- `validateIngest({workspaceId, conversionActionId, clickIdType, clickId})` → `validateOnly:true`, no row; reason enum.
- `listConnectedCustomerIds()` (platform super-admin runbook).
- `resolveDeveloperToken(workspaceId)` → `platformCredentialService.resolveForOwner({ownerId: resolveCredentialOwnerIdForWorkspace(ws), type:"google"}).config.adsDeveloperToken` → `{kind:"missing"}` when absent; decrypt/infra errors throw (retryable) via a non-swallowing variant of `findDecrypted*`. Needed only for Ads-API operations (setup, sync, validate's action lookup) — never for delivery.
- `findInFlightConnectSession(workspaceId)` → `connectSessionService.findLatestInFlightForWorkspaceProvider({workspaceId, provider:"googleAds"})` — how the settings page resumes the picker after the OAuth round-trip: the engine's `returnUrl` must be an absolute allow-listed URL (`apps/builder/src/features/connections/lib/connect-flow.ts:90`, `apps/builder/src/lib/oauth-referer.ts:49`) and the callback never appends the session id (`callback.ts:356`).
- Connect / reconnect / disconnect / pick / cancel go through **googleAds-specific server actions** wrapping the engine (`startConnect`, `startReconnect`, `connectionService.connectTargets`, `connectSessionService.cancel`, `connectionService.disconnect`) behind `assertWorkspaceSuperAdmin` + `isSupportSession` rejection — the generic private `connectionsAPI` enforces only workspace membership (`features/connections/api/private.ts:256`, `packages/connections/src/connect-targets.ts:159`), so the picker uses it for **reads only** (`getConnectSession`).

**`google-ads/conversion-service.ts` — `googleAdsConversionService`**:
- `recordConversion({workspaceId, contactInboxId, channel, source, scopeId, conversionActionId, value?, currency?, orderId?, occurredAt, triggerMessageId?})` → `queued | noClick | noAccount (not ready / needs_reauth) | unknownConversionAction | actionDisabled | invalidValue | invalidInput`; validates value/currency (together; finite, 0 ≤ v ≤ 1e12; ISO-4217 upper) and the resolved `orderId` (blank = absent, trimmed 1..128); `transactionId` per D8; snapshots account fields + `lookbackWindowDays`; `insertIgnoreDuplicate` (attempt 0) → `enqueueSend(0, delay)`; deduped ⇒ `findByTransactionId`, redrive if `pending`, unclaimed and its current-generation job is not live. Non-queued outcomes write no row; the caller takes its error branch with a stable code.
- `enqueueSend(event, attempt, delayMs)` → `enqueueIntegrationJob({type: sendGoogleAdsConversion, data:{googleAdsConversionEventId, workspaceId, attempt}}, {jobId:"google-ads-send-{id}-a{attempt}", delay})`; a given `{id, attempt}` is enqueued at most once; every redrive goes through `redrive(...)` first. JobIds never contain `:`.
- `deliver({eventId, workspaceId, attempt, isLastInJobAttempt})` (claimToken = fresh uuid):
  1. `claimForSending({attempt, claimToken})` (pending → sending; the job's generation must equal the row's); nothing claimed → return.
  2. Load satellite + Connection; not active/ready, or snapshot `customerId`/`conversionCustomerId` differs → `finishSending(skipped_no_account)`. `needs_reauth`/`degraded` → `releaseClaim(attempt+1)` + `enqueueSend(attempt+1, 1h)`; generation cap 30 → `failed(delivery, needs_reauth)`.
  3. Advisory expiry (D10) → `finishSending(skipped_expired)`.
  4. `googleClickReceivedAt + 6h > now` → `releaseClaim(attempt+1)` + `enqueueSend(attempt+1, remaining)`.
  5. `ctx = buildContext({workspaceId, integrationType:"googleAds", integration: row})`; `integrationGoogleAds.runAction("ingestEvent", {ctx, props:{ loginAccountId: row.loginCustomerId ?? row.customerId, operatingAccountId: event.conversionCustomerId, conversionActionId, event }})` — the SDK refreshes the access token proactively (`refreshAuth`), persists it (`authStore.save` → `recordAuthSaved`), and on a revoked grant calls `markOffline` → Connection `needs_reauth`. No developer token is needed for ingest.
  6. 2xx → `finishSending(sent {requestId, sentAt, processingStatus:"processing", nextProcessingCheckAt: now+3h})`; `fieldWarnings` logged at `warn` (sanitized).
  7. `AuthException` (revoked) → same handling as step 2's `needs_reauth`. `GoogleAdsException.retryable` → keep the claim and rethrow (BullMQ retries the same job) unless `isLastInJobAttempt` → `finishSending(failed(delivery))`. Terminal → `finishSending(failed(delivery))` + `logProviderError({provider:"google-ads", …sanitized})`.
  All `finishSending`/`releaseClaim` calls carry the claimToken; a mismatch (sweeper rotated it) is a logged no-op.
- `pollProcessingStatus({limit})`: keyset over `listDueForProcessingCheck`; per-row try/catch; bounded concurrency (p-limit 4 per connection); `runAction("retrieveRequestStatus")`; **match the destination entry** (`operatingAccount.accountId === event.conversionCustomerId && productDestinationId === event.conversionActionId`; zero/multiple matches → `unknown`); `SUCCESS` → `processed`; `FAILED|PARTIAL_SUCCESS` (one-event request ⇒ the event failed) → `failed(processing)` + `processingDetail` + `logProviderError`, except documented retryable reasons (TOO_RECENT-class) → `redrive(from sent)` + `enqueueSend(+6h)`; `PROCESSING|unknown|429|5xx` → stay `sent`, `processingStatus` = `processing` | `unknown`, `processingAttempts+1`, backoff 3h→6h→12h→24h; `sent` > 7 days after `sentAt` → `failed(timeout)`, `processingStatus: timed_out`.
- `sweepStranded()`: `pending` past due > 10 min whose current-generation job is not in state `waiting|delayed|active|prioritized` (`integrationQueue.getJob(jobId)?.getState()`; a retained `completed`/`failed` job does not count as live) → `redrive` + enqueue; `sending` claimed > 15 min → `redrive(from sending)` (rotates the token) + enqueue.
- `retryEvent` (UI): `redrive(from failed)` + enqueue; if the enqueue fails the sweeper picks up the `pending` row.
- Pure, unit-tested: `computeSendDelayMs`, `nextProcessingBackoff`, `buildTransactionId`, `isLeadLikeCategory`.

**`google-ads/click-fields.ts`** (client-safe subpath `./google-ads/click-fields`, like `ads-conversion/channel-fields`): `resolveGoogleAdsClick(referral) → {clickIdType, receivedAt}|null` (never the id); `selectGoogleAdsBadge(contactInboxes)`.

**`google-ads/owner.ts`**: `resolveCredentialOwnerIdForWorkspace(workspaceId)` — workspace-derived, tenant-aware (`tenantId !== ROOT_TENANT_ID` → `tenantService.findById(tenantId)?.ownerId ?? workspace.ownerId`), usable from builder and worker (the builder's `resolveOwnerForWorkspace` is `server-only`); documented in `docs/tenancy.md`.

**`compactReferral`** (`contact-inbox/service.ts:188`): keep `null` when `key ∈ GOOGLE_CLICK_REFERRAL_KEYS`; everything else unchanged (test both branches).

**Teardown**: `purgeWorkspaces` already passes `allIntegrations` (`apps/worker/src/schedule/handlers/purge-workspaces.ts:30`) → covers `googleAds` once it is in `channel-registry` (verify with a test). `workspace-lifecycle/service.ts` `disconnectWorkspaceIntegrations` (pause teardown) gets a `googleAds` entry.

## 9. Worker

- `packages/worker-config/src/queues/integration/index.ts`: `IntegrationJobAction += sendGoogleAdsConversion`; `IntegrationJobSendGoogleAdsConversion {googleAdsConversionEventId, workspaceId, attempt}`; add to the `IntegrationJobData` union; `jobOptionsByAction` = `adsConversionRetryOptions` (attempts 5, exponential 30 s; no priority — mirrors `sendMetaCapiEvent`). Schedule queue (`queues/schedule/index.ts` ~L36/L209): `googleAdsHousekeeping` job + data type.
- `apps/worker/src/integration/handlers/google-ads/send-conversion.ts`: `withBlockedOwnerGuard(ws, () => googleAdsConversionService.deliver({…, attempt: job.data.attempt, isLastInJobAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1)}))`; the worker switch passes `job`; case in `apps/worker/src/integration/worker.ts` near L468 (exhaustive `never` switch L562–567). Tests run against a real BullMQ queue (jobId dedup, `getState`).
- `handlers/google-ads/send-google-ads-conversion-step-handler.ts` (flow step): `googleAdsChannels.safeParse(contactInbox.channel)`; `resolveContactVariablesDeep(conversation.contactId, {value, currency, orderId}, {contactInbox, conversation})`; `recordConversion({source:"flowStep", scopeId: step.id, triggerMessageId: props.triggerMessageId, occurredAt: new Date()})`; `queued` → `{status:"success"}`; other outcomes → `{status:"error", errorMessage: <stable code>}`; `invalidValue` / `invalidInput` (resolved templates failing the post-resolution schema: blank → absent, orderId trimmed 1..128) → `logProviderError("google-ads")` + error branch; unexpected failure → `google_ads_record_failed`. `triggerMessageId` falls back to `flowExecutionKey` only when it is a real BullMQ job id (stable across retries, distinct per run); the random `flow-inline-*` / `integration-job-*` fallbacks are ignored. Trigger actions and runs without either id still count a non-lead conversion without an `orderId` once per click (D8 warn) (mirror `meta-conversions/capi-input-error.ts`).
- Trigger action (`apps/worker/src/trigger/services/action-executor.ts`, after the `sendMetaCapiEvent` case L345): `getContactInbox()`; if that inbox has no Google click, fall back to `findLatestGoogleClickInboxByContact`; `googleAdsConversionFieldsSchema.safeParse`; resolve variables; `recordConversion({source:"triggerAction", scopeId: triggerId})`; invalid input → error log. Update the "3 inbox-consuming branches" comment, `packages/events/src/contact-inbox-context.ts:5-8`, and `apps/worker/__tests__/action-executor-contact-inbox-attribution.test.ts`.
- `apps/worker/src/schedule/handlers/google-ads-housekeeping.ts` (every 10 min; `register-schedules.ts` `upsertJobScheduler`; `schedule/worker.ts` case ~L165; overlap guard like `clear-expired-support-access.ts:15-18`): `pollProcessingStatus`, `sweepStranded`, daily `syncConversionActions` + `connectionService.verify` per connected googleAds connection (surfaces revoked grants as `needs_reauth`). Crons are exempt from `withBlockedOwnerGuard` (invariant 15); blocked owners are skipped per row for Google calls.
- Rolling deploy: consumers (P4) land before producers (P6); the worker is deployed before the builder; an old worker receiving the new job type fails the exhaustive switch and BullMQ retries on a new worker.

## 10. Channel capture

**WhatsApp** (`integrations/whatsapp/src/handlers/message/incomming-message.ts`): in `parseTextMessage` (L78) run `decodeInvisibleGoogleClick(body)`; only when a payload parsed, `stripConsumedRun` and use the clean text for the `/ref-` check and `text`; at ~L235 merge `toGoogleClickReferral(payload, messageTimestamp)` into `referral`; `referralSource` stays Meta-only; no raw JSON retained. Test `integrations/whatsapp/__tests__/google-click-capture.test.ts` (stripped text, referral keys, plain text unchanged, IVS text unchanged).

**Messenger** (`integrations/messenger/src/handlers/message/incoming-message.ts` L345–352): after `normalizeMetaAdReferral`, `parseGoogleClickRef(rawReferral.ref ?? "")`; on match spread `toGoogleClickReferral(payload, ts)` and **set the returned `ref` to `null`** — a Google ref is not a ChatbotX reflink, and `runRef` would otherwise throw `findOrFail` for an unknown reflink (`apps/worker/src/integration/handlers/ref.ts:264-271`, `decodeRef` always falls back to `reflink`). Test `integrations/messenger/__tests__/google-click-ref.test.ts` (referral keys; `ref === null`; non-Google refs untouched).

**Worker persistence** (`apps/worker/src/integration/handlers/received-message.ts`): contact source at L367 becomes `hasGoogleClick(parsedMessage.referral) ? contactSources.enum.ads : (metaReferralToContactSource(referralSource) ?? contactSources.enum.inboundMessage)` — Google first, because an m.me `?ref=` arrives as Meta `source:"SHORTLINK"` which maps to `botLink`. Persistence flows through the existing `getReceivedMessageContactInboxTracking` (L766) → `updateTracking` (jsonb `||`) and the referral-only branch (L708). Tests in `apps/worker/__tests__/received-message.test.ts` (WhatsApp + Messenger: persisted keys, source `ads`, no `runRef` for a consumed Google ref).

**Zalo**: spike only (P8); no product code.

## 11. Builder

### 11.1 Route & registry
- `features/integrations/settings-registry.ts`: `{ slug:"google-ads", titleKey:"googleAds.title", icon: <one concrete icon: `SiGoogleads` if exported by react-icons/si, else `MegaphoneIcon`> }`. The settings layout (`(settings)/settings/layout.tsx:16`) already guards superAdmin.
- `app/space/[workspaceId]/(settings)/settings/integrations/google-ads/page.tsx`: loads `integrationGoogleAdsService.findByWorkspaceId`, `hasAdsDeveloperToken` (derived boolean) and the workspace's in-flight googleAds `ConnectSession` → `<GoogleAdsSettings/>` with the picker open when a session is `awaiting_selection`, or the "not available" state.

### 11.2 Feature folder `apps/builder/src/features/integration-google-ads/`
```
actions/   start-connect.action.ts   → assertWorkspaceSuperAdmin + reject isSupportSession →
             startConnect({ workspaceId, provider:"googleAds", config: undefined,
                            redirectUrl: new URL(`/space/${ws}/settings/integrations/google-ads`, await getOriginUrlFromHeader()).toString(),   // absolute, allow-listed origin
                            ownerId: await resolvePlatformOwnerId({ userId: ctx.user.id, workspaceId }), actor: { actorUserId: ctx.user.id } })
             → redirect(session.nextAction.url)      (features/connections/lib/connect-flow.ts — same code path as orpc createConnection)
           start-reconnect.action.ts → startReconnect(connection, same shape)
           pick-account.action.ts    → connectionService.connectTargets({sessionId, workspaceId, targetIds:[customerId], actorUserId}) then finishSetup   (session must belong to this workspace + provider googleAds)
           cancel-connect.action.ts  → connectSessionService.cancel
           disconnect.action.ts (workspaceActionClientAllowExpired) → connectionService.disconnect
           finish-setup.action.ts, sync-conversion-actions.action.ts, retry-event.action.ts, validate-request.action.ts
           → all: workspaceActionClient.bindArgsSchemas([zodBigintAsString()]) + assertWorkspaceSuperAdmin; isSupportSession rejected for connect/reconnect/pick/cancel/disconnect/retry/validate; no-input actions → execute()
api/index.ts   googleAdsAPI {getIntegration, getInFlightConnectSession, listEvents} (authorizedAPI + workspaceAuthorizedMidddleware + assertWorkspaceSuperAdmin); lazy in routers/index.ts like adsAPI
components/    google-ads-settings.tsx
               connect-card.tsx: none → "Connect Google Ads" (explains: sign in with a Google account that has Standard/Admin access to the advertiser's Google Ads; scopes requested; AhaChat registers your Customer ID with Google for attribution);
                                 connected → account (name, 123-456-7890, via manager X), Connection status badge (connected/degraded/needs_reauth → Reconnect), Disconnect (confirm)
               account-picker.tsx: on mount asks googleAdsAPI.getInFlightConnectSession; polls connectionsAPI.getConnectSession({id}) every 2 s while pending/authorized; on awaiting_selection lists session.targets (selectable vs alreadyConnected this/other workspace), single-select → pick-account action → invalidate; failed/expired/cancelled → message + retry; Cancel → cancel-connect action. Reads use the generic API; mutations only the googleAds actions. (First engine-based picker in the builder: `/connect/[sessionId]` is a neutral status page; existing integrations still use legacy callbacks.)
               setup-card.tsx: conversion customer, data-terms warning, setupError code → i18n, "Retry setup"
               conversion-actions-card.tsx: table (name, category, counting, lookback, status), Sync, syncedAt, help link to create an UPLOAD_CLICKS action in Google Ads
               events-history-table.tsx: status + failureStage, processingStatus, action, channel, masked click id, occurredAt, sentAt, error tooltip, Retry (failed); status filter; perPage ≤ 100
               validate-request-dialog.tsx (validateOnly; labelled as a configuration check)
               google-ads-conversion-fields.tsx (shared by flow step + trigger action: action select from orpc.googleAdsAPI.getIntegration cache; keeps an unavailable selected id visible with a warning; empty-state link to settings; template-capable value / currency / orderId)
lib/status.ts  exhaustive literal maps → i18n keys
hooks/use-invalidate-google-ads.ts  invalidateQueries({queryKey: orpc.googleAdsAPI.key()}) + connectionsAPI keys — called by every mutation before router.refresh()/push
```

### 11.3 Platform-credential admin
`features/platform-credentials/google/*`: add `adsDeveloperToken` (password input, optional, "Standard access developer token of your Google Ads manager account") to the form/action/schema with preserve/clear semantics (§6); add `/integrations/google-ads/callback` to the listed redirect URIs (`google-settings.tsx:53-59`). Public projection shows only "set / not set".

### 11.4 Badge & filter
- `features/conversations/schema/resource.ts` L53: `googleAdsClick: {clickIdType, receivedAt}.nullish()`; `queries/list-conversations.query.ts` L56 (and the find-conversation mapper): `resolveGoogleAdsClick(contactInbox.referral)`; `utils/ad-badge.ts`: `selectGoogleAdsBadge` (`selectAdBadge` unchanged); `conversation-item.tsx` L214: second badge `fields.adReferral.googleAds`.
- Contact filter boolean `fromGoogleAd` mirroring `fromCtwaAd` (`contact-filter` skill checklist): `contactFilterFields` (`partials/contact.ts` ~L281); `CONTACT_FILTER_FIELD_DEFINITIONS` (`schema/definitions.ts` ~L329); `STATIC_OPERATOR_RULES` (`schema/static-field-filter.ts` L117) **and** `staticFieldRules` (`components/static-field-filter-config.ts` L199); `buildConditionWhere` → `buildExistsBooleanWhere(contactInboxExists, googleClickPredicate(), operator, value)` (`queries/contact-filter/index.ts` ~L572); group + i18n (`contact-filter-config.ts` L357). Tests in `packages/database/__tests__/contact-filter.test.ts` and `apps/builder/__tests__/contact-filter-*.test.ts`.

### 11.5 Flow step + trigger action `sendGoogleAdsConversion` — every surface (verify with `rg -n sendMetaCapiEvent apps packages`)

| File | Change |
|---|---|
| `packages/flow-config/src/steps/send-meta-capi-event.ts` | export `optionalTemplateOrStatic` (defined at L62, currently unexported) |
| `packages/flow-config/src/steps/send-google-ads-conversion.ts` (new) | `googleAdsConversionFieldsSchema {conversionActionId: /^\d+$/, value: optionalTemplateOrStatic(metaCapiValueSchema), currency: optionalTemplateOrStatic(metaCapiCurrencySchema), orderId: optionalTemplateOrStatic(z.string().trim().min(1).max(128))}` + refinement "value and currency together"; `sendGoogleAdsConversionSchema` (+`id`, `stepType`, `states:[success,error]`); `defaultFn` (`conversionActionId:""`) |
| `packages/flow-config/src/index.ts` (~L133), `steps/step-action.ts` (L135), `shared.ts` (L47 + L155), `channel-rules/policies/define.ts` (L113 `"worker"`) | registration |
| `apps/worker/src/integration/handlers/step.ts` (L70 + L449), `flow-utils.ts` (L230 `false`) | handler map / produces-message (both exhaustive Records) |
| `apps/builder/src/features/flows/react-flow/steps/send-google-ads-conversion/{index,editor,viewer}` + `steps/index.tsx` (L63 + L139) + `nodes/perform-action/menu.tsx` (after L642, + menu test) | step UI (copy `send-meta-capi-event/*`; summary helper next to `features/meta-conversions/lib/event-summary.ts`) |
| `packages/database/src/partials/trigger.ts` (L11) | `triggerActions` += |
| `apps/builder/src/features/triggers/components/actions/schema/send-google-ads-conversion.ts` + `schema/index.ts`, `add-action.tsx` (~L79), `base-editor.tsx` (L130), `components/actions/editor.tsx` (L72) | trigger action UI |
| `apps/worker/src/trigger/services/action-executor.ts` | new case (§9) |

The flow-node cascade (invariant 16) does not apply (step, not node type).

### 11.6 i18n
All `apps/builder/messages/*.json` must carry every key (`i18n-check --source en --locales messages` runs in builder `lint`); `en.d.json.ts` is regenerated. Keys: `googleAds.{title,description,notAvailable,connect.*,picker.*,setup.*,status.*,errors.*,conversionActions.*,events.*,validate.*}`, `flows.actions.sendGoogleAdsConversion`, `trigger.actions.sendGoogleAdsConversion`, `fields.adReferral.googleAds`, `fields.googleAds.label` (DisconnectIntegrationDialog), `platformCredentials.google.adsDeveloperToken*`, contact-filter label `fromGoogleAd`. en/vi by hand; other locales per the repo's existing practice for non-reviewed locales. Reuse existing `fields.*`/`actions.*` keys first.

## 12. Phased tasks (TDD: tests first; consumers before producers; compile-safe grouping)

**P0 utils** — tests `packages/utils/__tests__/google-click.test.ts`; `google-click.ts` + export; error-log provider + label (+ cascade grep + existing label test).

**P1 DB + credential** — tests (repository unit tests; DB-backed `__tests__/integration/google-ads-*.test.ts`; `credential.test.ts` extension); `partials/google-ads.ts` enums; `IntegrationGoogleAds` + `GoogleAdsConversionEvent` schemas; referral keys (contact-inbox + sdk); relations + **relations/index.ts double edit**; `schema/index.ts`; `types.ts`; repositories (incl. connect-session finder); `queries/google-click.ts`; `googleCredentialSchema.adsDeveloperToken`; `make:migration add_google_ads_conversions`; inspect; `db:check-drift`. **Stop for owner approval before any apply.**

**P2 `integrations/google-ads` + engine registration** — tests (§6; `packages/connections/__tests__/service.test.ts` multiAccount + reconnect-config cases; `apps/builder/__tests__/oauth-callback-connect-session.test.ts` for a builder-started multiAccount session landing in `awaiting_selection` and redirecting to the settings `returnUrl`); scaffold package; `CI=true pnpm install --no-frozen-lockfile`; `integrationTypes`, `CONNECTION_REGISTRY`, store binding, channel-registry, workspace deps, `OAUTH_CALLBACK_SLUG`; `completeReconnect` fix; `pnpm check:circular`.

**P3 business** — tests: `integration-google-ads.service.test.ts` (finishSetup paths, setupError codes, readiness, developer-token missing, support-session rejection), `google-ads-delivery.test.ts` (claim; snapshot mismatch; needs_reauth deferral; expiry; too-recent; AuthException → deferral; 2xx; terminal; last attempt; jobIds without `:`), `google-ads-conversion.service.test.ts` (gate; dedup keys per category incl. orderId / triggerMessageId / fallback; recovery; value/currency), `google-ads-housekeeping.test.ts` (destination matching, mapping, backoff, timeout, sweeper, daily verify/sync), `contact-inbox-compact-referral.test.ts`, `platform-credential-google-ads-token.test.ts` (preserve/clear, derived boolean); implement §8 + `compactReferral` + lifecycle teardown entry.

**P4 worker consumers + crons** — tests (thin handler attempt plumbing; housekeeping; real BullMQ); queue action/type/options; handler + `worker.ts` case; schedule job + handler + `register-schedules.ts` + `schedule/worker.ts` case.

**P5 capture + badge + filter** — tests (whatsapp/messenger capture; `received-message`; badge; filter); implement §10 + §11.4.

**P6 producers + the minimal UI they need** — tests (`packages/flow-config/__tests__/send-google-ads-conversion.test.ts`; step handler; trigger executor + inbox fallback; trigger schema; viewer); all §11.5 surfaces; `googleAdsAPI.getIntegration`; invalidation hook; `google-ads-conversion-fields.tsx`; step/trigger i18n.

**P7 settings UI + picker + platform-credential admin** — tests (`google-ads-actions.test.ts`: super-admin, bind args, support-session rejection, service calls; picker states incl. `alreadyConnected other_workspace`, failed/expired; connect-card states; validate dialog; `google-settings-actions.test.ts` extension); route, registry, settings components, `listEvents`/`getInFlightConnectSession` API, admin form, remaining i18n.

**P8 docs + Zalo spike** — `docs/google-ads-conversion-tracking.md` (model, formats, attribution policy, dedup, state machine, timing, OAuth-app prerequisites incl. verification + redirect URI, IAM role, runbook query for connected CIDs, rolling-deploy note); AGENTS.md "Docs and support links" line; `docs/tenancy.md` owner-helper note; Zalo spike (≤ 0.5 day, no product code: on a dev OA with every webhook event enabled, log raw bodies; open `https://zalo.me/{oa_id}?dynamin_param=gclid:TEST123,campaignid:1` as a non-follower, as a follower, and via `zalo.me/{custom_url}`; record event + field, or "none" → ask ctm-ads@google.com; write the fixture into the doc).

## 13. Verification

```bash
pnpm lint
pnpm --filter @chatbotx.io/utils test
pnpm --filter @chatbotx.io/database test && pnpm --filter @chatbotx.io/database db:check-drift
DATABASE_URL=<dev db> pnpm --filter @chatbotx.io/database test:db
pnpm --filter @chatbotx.io/integration-google-ads test && pnpm --filter @chatbotx.io/integration-google-ads check-types
pnpm --filter @chatbotx.io/connections test && pnpm --filter @chatbotx.io/business test && pnpm --filter @chatbotx.io/business check-types
pnpm --filter @chatbotx.io/flow-config test && pnpm --filter @chatbotx.io/flow-config check-types
pnpm --filter worker test && pnpm --filter worker check-types
pnpm --filter builder test && pnpm --filter builder check-types
pnpm --filter @chatbotx.io/integration-whatsapp test && pnpm --filter @chatbotx.io/integration-messenger test
pnpm check:circular && pnpm check:unused
```

Manual E2E (after the owner approves + applies the migration; needs §3 #2–3):
1. Admin → Platform credentials → Google: set `adsDeveloperToken`; confirm the Google console lists `/integrations/google-ads/callback` and the two new scopes.
2. Workspace → Settings → Integrations → Google Ads → Connect → Google consent (a test user while the app is unverified) → back on the settings page the picker lists accessible customers (test manager + its client) → pick the client → setup card shows the conversion customer and lists `UPLOAD_CLICKS` actions (create one in Google Ads first if none).
3. WhatsApp: open Google's test URL and send → inbox text clean; "Google Ads" badge; `ContactInbox.referral.gclid` + `googleClickReceivedAt`; `Contact.source = ads`; filter `fromGoogleAd` finds the contact. Messenger: `m.me/<page>?ref=gclid:TEST…` → same, and no `runRef` job.
4. "Validate request" with the captured gclid → success or field error.
5. Flow step on a contact without click → error branch; with click → success + `pending` row with a ≈ 6 h delayed job (RedisInsight). Trigger action likewise. Real send: set `googleClickReceivedAt = now−7h` in the dev DB, run the sweeper → `sent` + requestId → housekeeping → `processed` or `failed(processing)` with reason.
6. Revoke the grant in the Google account → next delivery/verify → Connection `needs_reauth`, UI shows Reconnect → reconnect restores delivery and refreshes the account config.
7. Google Ads → Goals → Conversions → action → Uploads/Diagnostics within ~24 h.

## 14. Risks & follow-ups

- **OAuth app verification** for the sensitive scopes is the critical-path ops item (see §3 #2). Develop against test users meanwhile.
- **First engine-based picker in the builder**: keep it small; the API/MCP path already exercises the same session endpoints.
- **Developer token placement**: encrypted platform `google` credential; rides only in the encrypted `ConnectSession` auth during connect; stripped before any persistence; no runtime metadata fallback; leak test.
- **Shared-engine edit** (`completeReconnect` applies `candidateToConfig`) benefits Messenger/Instagram too; covered by the engine test suite.
- **Access through managers**: `login-customer-id` = the manager the user reaches the customer through (`loginCustomerId`); Data Manager `loginAccount = loginCustomerId ?? customerId`. Conversion customer not reachable → `setupError = conversion_customer_inaccessible`.
- **Known adjacent issues recorded, not fixed here (R19)**: engine satellites store `auth` in plaintext jsonb (Sheets/Calendar convention); `facebookAds` legacy path encrypts `auth` while the engine path would write plaintext; `googleSheets` violates the `makeAuthStore` table-name convention (harmless because it has no `refreshAuth`).
- **Attribution semantics** per provider family (D7); click-id retention on events after contact deletion (FK set null; define retention in docs); 6 h / 90 d advisory; `MESSAGE` fixed; Zalo unverified; consent omitted.
- **Google-side CID allowlisting** is manual (ops).

## 15. AGENTS.md invariants touched

- **#2** `relations/index.ts` two edits × 2 files. **#3** `ChannelType`, `AdsConversionChannel`, `adsEligibleChannelTypes` untouched. **#4/#6** `bindArgsSchemas` + `.bind(null, workspaceId)`; no-input actions → `execute()`. **#5** `CI=true pnpm install --no-frozen-lockfile` after the new package. **#7** i18n everywhere; exhaustive literal label maps. **#9** action/API → services → repositories; no `db` in apps/integrations; the worker reaches the integration through `channel-registry` like every integration. **#10/#18** tenant-aware owner via `resolveCredentialOwnerIdForWorkspace`. **#14** disconnect via `workspaceActionClientAllowExpired`. **#15** `withBlockedOwnerGuard` on the integration job; crons exempt. **#19** support sessions rejected for Google-mutating actions. **#20** logger key `err`, sanitized errors; never log tokens/full click ids. **#21** TanStack invalidation on every mutation. **#16-style cascades**: `rg sendMetaCapiEvent` for the step; `rg "Record<IntegrationType"` + `CONNECTION_REGISTRY` exhaustiveness for the new `IntegrationType`. No dynamic `import()` in tsdown packages. Migration generate-only. Schema-default parity: explicit inserts, DB-backed tests.
