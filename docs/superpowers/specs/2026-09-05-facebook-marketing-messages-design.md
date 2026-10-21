# Facebook Marketing Messages — Design

**Date:** 2026-09-05
**Status:** Approved design, pending implementation plan
**Scope:** A new workspace tool that lets a user grant Facebook Marketing Messages
access and create a Meta *message campaign* for a connected Messenger Page.

---

## 1. Summary

Add a "Facebook Marketing Messages" tool to `/space/<workspaceId>/tools`.

Description string: *"Drive engagement and sales with personalized promotional
messages on Messenger."*

The tool has three surfaces:

1. **Platform admin** configures a Marketing Messages **config ID** on the
   existing Messenger platform credential.
2. **Workspace user** grants Facebook access (`marketing_messages_messenger`)
   through an OAuth dialog driven by that config ID; the long-lived user token
   is stored per workspace.
3. **Workspace user** creates a campaign: name, Page, ad account, budget, and
   message content. Saving creates the campaign on Meta via
   `POST act_<AD_ACCOUNT_ID>/message_campaign`.

### In scope

- Marketing Messages config ID on the Messenger platform credential.
- Tool card on the Tools page.
- OAuth grant / re-grant flow and its token table.
- Campaign list, create, and edit pages.
- Message-content authoring for all four Meta templates (Text, Button, Media,
  Generic) plus quick replies.
- Creating and updating the Meta message campaign.

### Out of scope

- **Sending marketing messages.** The `message` send API, audience/subscriber
  targeting, and delivery reporting are a separate task. Content authored here
  is validated and persisted so the send task can consume it.
- Pixel selection, campaign scheduling (`start_time` / `end_time`).
- Background token refresh before the ~60-day expiry.

---

## 2. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Config ID is an **optional** field on the existing `messenger` credential | Marketing Messages uses the same Facebook app as Messenger/Lead Ads/Ads/Catalog. A new credential type would cascade through 5 maps; an optional field avoids breaking existing encrypted rows and existing admins. |
| D2 | Unconfigured config ID → card visible, connect action throws a localized error | Matches `connectLeadAdsAction`'s handling of a missing Messenger credential. Keeps `TOOLS_CONFIG` static. |
| D3 | Reuse the Messenger OAuth callback with `state.flow = "facebookMarketingMessages"` | It is the only `redirect_uri` registered with the Facebook app. A dedicated route would require every tenant — including resellers with their own app — to register a new Valid OAuth Redirect URI. |
| D4 | Permission is checked against the **stored token** in the new table | The token we will actually use is the user token; page tokens are not. No row / invalid / expired → grant panel. |
| D5 | **One auth row per workspace** (unique index on `workspaceId`) | Mirrors `IntegrationFacebookAds_workspaceId_key`. Re-granting upserts and overwrites the App-Scoped User ID. |
| D6 | Content is **stored now, sent later** | The campaign endpoint takes no message content; persisting it lets the send task consume a validated payload. |
| D7 | **One message per tool row** | One tool = one campaign = one message, matching the single Content group in the requirements. |
| D8 | Editing **syncs back to Meta** | `POST /<MESSAGE_CAMPAIGN_ID>` for name and budget. Ad account and Page are frozen after creation. |
| D9 | Meta call first, DB write second | Every stored row is guaranteed to have a live `campaignId`, so the edit path never has to handle a row without one. |
| D10 | Omit `pixel_id`, `start_time`, `end_time` | Not in the requirements; Meta's defaults are reasonable (start = now; end = start + 30d for lifetime budgets). |
| D11 | Route `/space/<id>/fb-marketing-messages`, no extra permission | Mirrors `fb-lead-ads`. No `permission` key in `TOOLS_CONFIG`. |
| D12 | No `performAction` button type | "Perform actions" is reachable by pointing `startExternalNode` at an existing Perform Actions node. Removes the canvas dependency entirely. |
| D13 | Quick replies support all three `content_type` values | `text`, `user_phone_number`, `user_email`. |
| D14 | Budget entered in **major units**, validate `> 0` only | No minimum lookup; Meta's rejection is surfaced on save. |
| D15 | Zero-decimal currencies handled via Meta's offset list | See §8. `TWD` has offset 1 in Meta's table even though ISO 4217 gives it 2 decimals — this is why Meta's list is authoritative, not ISO. |
| D16 | Media attachment uploaded to Meta **at save time** | Meta requires an `attachment_id` or a Facebook-hosted URL; an S3 media-library URL is neither. |
| D17 | ToS not accepted → **blocks save**, with the remediation link | Meta would reject the create anyway. |
| D18 | Page referenced by **raw `pageId` string**, no FK | The row survives a Page disconnect/reconnect. |
| D19 | Grant state gates the list page, the create page, **and the create action** | The action check is the real boundary; the UI checks are convenience. |
| D20 | Persistent **Reconnect** button once granted | `auth_type=rerequest` is already in the URL, so a declined permission can be re-asked and a wrong Facebook account can be replaced. |
| D21 | Quick replies offered on all four templates | `quick_replies` is a `message`-level sibling of `text`/`attachment`, so it is structurally valid everywhere. See §11-O3. |
| D22 | Table names `FacebookMarketingMessagesAuth` + `FacebookMarketingMessage` | Keeps the `Facebook` prefix so a future WhatsApp marketing-messages tool does not collide. |

---

## 3. Part 1 — Marketing Messages config ID

**File:** `packages/database/src/partials/credential.ts`

Add to three places in the `messenger` group — and **only** those three; do not
touch `credentialTypes` (no cascade through `credentialSchemas`,
`credentialPublicSchemas`, `CredentialByType`, `CredentialPublicByType`):

```ts
export const messengerCredentialSchema = z.object({
  clientId: z.string(),
  version: z.string(),
  verifyToken: z.string(),
  clientSecret: z.string(),
  marketingMessagesConfigId: z.string().optional(),   // NEW
})

export const messengerCredentialPublicSchema = messengerCredentialSchema.pick({
  clientId: true,
  version: true,
  verifyToken: true,
  marketingMessagesConfigId: true,                    // NEW
})

export const messengerCredentialUpdateSchema = z.object({
  // …existing required fields…
  marketingMessagesConfigId: z.string().trim().optional(),  // NEW
})
```

`.optional()` is required on all three: the credential `value` is stored
encrypted as a whole object, so a required field would fail to parse every
existing row, and a required field on the update schema would block every admin
who has not set up Marketing Messages.

The config ID is not a secret (it is sent in the OAuth URL), so it belongs in
the public projection — same treatment as `whatsappCredentialSchema.configId`.

**UI:** `apps/builder/src/features/platform-credentials/messenger/messenger-settings.tsx`

- One `InputField name="marketingMessagesConfigId"` in
  `EditMessengerSettingsForm` (not `required`).
- Add it to `defaultValues` as `publicConfig?.marketingMessagesConfigId ?? ""`.
- Optionally display it in the read-only `MessengerSettings` card alongside
  `appId`.

**Action:** `update-messenger-settings.action.ts` — one extra line copying
`parsedInput.marketingMessagesConfigId` into the `MessengerCredential` object.

**i18n:** `fields.marketingMessagesConfigId.label`. Check `fields.configId.*`
first — it already exists for WhatsApp and may be reusable verbatim.

---

## 4. Part 2 — Tool card

**File:** `apps/builder/src/features/tools/tools-list.tsx`

Insert into `TOOLS_CONFIG` immediately after the `facebook-lead-ads` entry:

```ts
{
  id: "facebook-marketing-messages",
  labelKey: "facebookMarketingMessages.title",
  descriptionKey: "facebookMarketingMessages.description",
  icon: SiFacebook,
  getLink: (id: string) => `/space/${id}/fb-marketing-messages`,
},
```

No `permission` key (D11), so `canShowTool` returns `true` for every member who
can open the Tools page.

`apps/builder/__tests__/tools-list-config.test.ts` already asserts against
`TOOLS_CONFIG`; extend it for the new entry and its position.

**i18n:** new top-level `facebookMarketingMessages` namespace in
`apps/builder/messages/en.json`:

```
title:       "Facebook Marketing Messages"
description: "Drive engagement and sales with personalized promotional messages on Messenger."
```

---

## 5. Part 3 — Grant flow

### 5.1 Auth URL

**File:** `integrations/messenger/src/apis/auth.ts`, beside `generateLeadAdsAuthUrl`.

```ts
export function generateMarketingMessagesAuthUrl({
  clientId,
  configId,
  version = DEFAULT_API_VERSION,
  redirectUrl,
  stateParams,
}: {
  clientId: string
  configId: string
  version?: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const params = new URLSearchParams({
    app_id: clientId,
    client_id: clientId,
    config_id: configId,
    auth_type: "rerequest",
    override_default_response_type: "true",
    redirect_uri: redirectUrl,
    response_type: "code",
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}
```

No `scope` parameter — the config ID supplies the permission set. This is the
one structural difference from `generateLeadAdsAuthUrl`, which passes
`LEAD_ADS_SCOPES`.

`auth_type=rerequest` matters for the same reason it does in
`generateCatalogAuthUrl`: without it, Facebook silently skips a previously
declined permission and returns a token missing
`marketing_messages_messenger`, so the grant looks successful and every
subsequent call fails.

### 5.2 Connect action

**File:** `apps/builder/src/features/facebook-marketing-messages/actions/connect.action.ts`

Modelled directly on `connect-lead-ads.action.ts`:

```
workspaceActionClient.bindArgsSchemas(workspaceIdrequestParams)
  → platformCredentialService.resolveForOwner({
       ownerId: await resolveOwnerForWorkspace(ctx.workspace),
       type: "messenger",
    })
  → if (!credential || !credential.config.marketingMessagesConfigId)
       throw new ChatbotXException(t("facebookMarketingMessages.errors.notConfigured"))
  → redirectUrl = await buildProviderCallbackUrl(credential, "/integrations/messenger/callback")
  → referer    = `${baseUrl}/space/${ctx.workspace.id}/fb-marketing-messages`
  → redirect(generateMarketingMessagesAuthUrl({
       clientId: credential.config.clientId,
       configId: credential.config.marketingMessagesConfigId,
       version:  credential.config.version,
       redirectUrl,
       stateParams: { workspaceId, referer, flow: "facebookMarketingMessages" },
    }))
```

`resolveOwnerForWorkspace` (not a bare `userId`) is required so a reseller's own
Facebook app is used when one is configured — see invariant 18(b).

### 5.3 Callback branch

**File:** `apps/builder/src/app/integrations/[...integration]/callback.ts`

Two edits:

1. `stateValidationSchema.flow` enum gains `"facebookMarketingMessages"`.
2. A new branch in the `case "messenger":` block, placed alongside the existing
   `metaCatalog` / `facebookAds` / `messagingAds` / `facebookLeadAds` branches
   and **before** the `reconnectIntegrationId` check:

```
if (stateParams.flow === "facebookMarketingMessages") {
  await withAuditContext(
    { userId, workspaceId: workspace.id, ipAddress: getGuestClientIp(req.headers),
      userAgent: req.headers.get("user-agent") ?? undefined },
    () => storeMarketingMessagesConnection({
      credentialConfig: messengerCredential.config,
      code, callbackUrl, workspaceId: workspace.id,
    }),
  )
  return redirect(safeReferer)
}
```

`withAuditContext` is required for the same reason the `facebookAds` branch
uses it: this raw OAuth route never populates the ALS actor context, so
`BaseService.audit()` would silently no-op.

`storeMarketingMessagesConnection` is a module-local helper mirroring
`storeFacebookAdsConnection`:

```
exchangeFacebookAdsCode(credentialConfig, code, callbackUrl)
  → exchangeFacebookAdsLongLivedToken(credentialConfig, shortLivedToken)
  → tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
  → facebookUserId = (await lookupFacebookUser(() =>
       getMessengerFacebookUser(accessToken, credentialConfig.version)))?.id
  → facebookMarketingMessagesService.upsertAuth({
       workspaceId, auth: { authType: AuthType.custom, accessToken,
                            expiresAt: tokenExpiresAt?.toISOString(),
                            version: credentialConfig.version },
       tokenExpiresAt, facebookUserId,
    })
```

`lookupFacebookUser` already exists in this file and is best-effort — a failed
identity lookup must not fail the connect. The App-Scoped User ID is therefore
nullable on the row.

> **Note:** `callback.ts` changed on disk during this design session
> (`getCurrentUserId` → `getCurrentUser`, `hasWorkspaceAccess` added). Read the
> current file before editing; the branch placement above is unaffected.

### 5.4 Eligibility check

**File:** `integrations/messenger/src/apis/auth.ts`

```ts
export const MARKETING_MESSAGES_SCOPE = "marketing_messages_messenger"

export function hasMarketingMessages(scopes?: string[]): boolean {
  return scopes?.includes(MARKETING_MESSAGES_SCOPE) ?? false
}
```

Sits beside `hasLeadsRetrieval` and is fed by the existing `debugToken` +
`toAppAccessToken`. The app access token must come from the **Messenger
platform credential resolved for this workspace's owner** — the app that minted
the token.

**File:** `apps/builder/src/features/facebook-marketing-messages/lib/grant.ts`

```ts
export type MarketingMessagesGrant =
  | { state: "missing" }
  | { state: "expired"; row: FacebookMarketingMessagesAuthModel }
  | { state: "valid";   row: FacebookMarketingMessagesAuthModel; accessToken: string }
```

Resolution order:

1. No row → `missing`.
2. `status === "invalid"` or `tokenExpiresAt` in the past → `expired`.
3. Decrypt `auth`; `debugToken` → `is_valid !== false && hasMarketingMessages(scopes)`.
   On failure, flip `status` to `invalid` and return `expired`.
4. Otherwise `valid`.

`is_valid` must be checked alongside the scopes: Facebook returns HTTP 200 with
a populated `scopes` array for tokens that have since expired or been revoked,
so scopes alone would report a dead grant as usable — the same trap documented
on `isTokenLeadEligible`.

Any Graph call elsewhere that returns error code `190`
(`GRAPH_ERROR_CODE_INVALID_TOKEN`, already exported from the facebook-ads
constants) flips `status` to `invalid`.

### 5.5 List page states

| Grant state | Rendered |
|---|---|
| `missing` | Grant panel: *"Please grant access to use the Marketing Messages feature"* + grant button. |
| `expired` | Grant panel **plus** an explicit expired/revoked warning, **and** the existing campaigns listed read-only below it. |
| `valid` | The campaigns table, with a persistent **Reconnect** button in the toolbar (same action). |

`/fb-marketing-messages/create` redirects back to the list unless the grant is
`valid`. The create and update actions re-resolve the grant server-side before
touching Meta (D19).

---

## 6. Data model

Both tables follow `MessagingAdsConnection`: standalone, **no** `Integration`
base row (unlike `IntegrationFacebookAds`, whose `integrationId` FK exists only
because it predates that pattern).

### 6.1 `FacebookMarketingMessagesAuth`

`packages/database/src/schema/facebook-marketing-messages-auth.ts`

| Column | Type | Notes |
|---|---|---|
| `...sharedColumns` | | `id`, `createdAt`, `updatedAt` |
| `workspaceId` | `bigintAsString` → `Workspace` | cascade; `uniqueIndex("FacebookMarketingMessagesAuth_workspaceId_key")` |
| `auth` | `jsonb` notNull | `FacebookAdsAuthValue`, wrapped by `encryptUtils.encryptObject` |
| `tokenExpiresAt` | `timestamp(timestampConfig)` | nullable — Facebook may omit `expires_in` |
| `status` | `text` `$type<"active" \| "invalid">` default `"active"` notNull | |
| `facebookUserId` | `text` | App-Scoped User ID; nullable (best-effort lookup) |

**Naming note:** the requirement said `tokenExpiredAt`; every sibling table uses
`tokenExpiresAt` (`IntegrationFacebookAds`, `IntegrationWhatsapp`). Use
`tokenExpiresAt`.

### 6.2 `FacebookMarketingMessage`

`packages/database/src/schema/facebook-marketing-message.ts`

| Column | Type | Notes |
|---|---|---|
| `...sharedColumns` | | |
| `workspaceId` | `bigintAsString` → `Workspace` | cascade; `index` |
| `name` | `text` notNull | ≤ 120 chars |
| `pageId` | `text` notNull | raw Meta Page ID, no FK (D18) |
| `adAccountId` | `text` notNull | `act_<id>` form |
| `currency` | `text` notNull | snapshot at create time, for display |
| `currencyOffset` | `integer` notNull | 1 or 100 — makes the minor-unit conversion auditable (D15) |
| `budgetType` | `text` `$type<"daily" \| "lifetime">` notNull | |
| `budgetMinorUnits` | `integer` notNull | exactly what was sent to Meta |
| `content` | `jsonb` notNull | the template union of §7.1 |
| `campaignId` | `text` notNull | Meta's `MESSAGE_CAMPAIGN_ID`; notNull because of D9 |
| `facebookUserId` | `text` | ASUID of the grant used at create time |

Indexes: `FacebookMarketingMessage_workspaceId_idx`, and
`FacebookMarketingMessage_campaignId_key` (unique) so a retry cannot duplicate
a campaign row.

### 6.3 Wiring

- **`packages/database/src/relations/index.ts` needs TWO edits per table** —
  `import` the relations file **and** spread it into the `relations` object.
  Missing either breaks Drizzle relational queries silently (invariant 2).
- Repositories under `packages/database/src/repositories/`.
- `facebookMarketingMessagesService` in
  `packages/business/src/facebook-marketing-messages/`, with an `index.ts`
  re-exporting `./service` and a matching `export * from` line in
  `packages/business/src/index.ts` (currently line ~67 for
  `./messaging-ads-connection`).
- Nothing in `apps/` imports `db` (invariant 9).
- Migration via `pnpm --filter @chatbotx.io/database make:migration`. **Show the
  SQL; do not run `db:migrate`.** Trim the generated `migration.sql` to only
  these two tables — `make:migration` re-emits already-applied tables.

---

## 7. Part 4 — Create page

Route: `apps/builder/src/app/space/[workspaceId]/fb-marketing-messages/create/page.tsx`,
mirroring `fb-lead-ads/create/page.tsx`: `AppBreadcrumb` (Tools → Facebook
Marketing Messages → Create) wrapped in `FlowStoreProvider` +
`CustomFieldStoreProvider`. Both providers are required — the flow/node pickers
need the former, `MediaLibraryOrInsertLink`'s variable picker needs the latter.

### 7.1 Content schema

`apps/builder/src/features/facebook-marketing-messages/schema/content.ts`

Bespoke, shaped 1:1 with Meta's payload so the send task needs no translation
layer. It borrows only `zodUrlWithVariables`, `uploadModes`, and
`BUTTON_LABEL_MAX` from existing packages.

```ts
// ── Actions ──────────────────────────────────────────────────────────────
const mmOpenWebsiteAction = z.object({
  actionType: z.literal("openWebsite"),
  url: zodUrlWithVariables(),
  browserSize: z.literal([40, 70, 100]),   // → webview_height_ratio
})
const mmStartExternalFlowAction = z.object({
  actionType: z.literal("startExternalFlow"),
  flowId: zodBigintAsString(),
})
const mmStartExternalNodeAction = z.object({
  actionType: z.literal("startExternalNode"),
  flowId: zodBigintAsString(),
  nodeId: zodBigintAsString(),
})

/** Quick replies are postback-only — Meta defines no URL quick reply. */
const mmPostbackAction = z.discriminatedUnion("actionType", [
  mmStartExternalFlowAction,
  mmStartExternalNodeAction,
])

// ── Buttons ──────────────────────────────────────────────────────────────
export const mmButtonSchema = z
  .object({ id: zodBigintAsString(), title: z.string().trim().min(1).max(BUTTON_LABEL_MAX) })
  .and(z.discriminatedUnion("actionType", [
    mmOpenWebsiteAction,          // → { type: "web_url" }
    mmStartExternalFlowAction,    // → { type: "postback" }
    mmStartExternalNodeAction,    // → { type: "postback" }
  ]))

// ── Quick replies ────────────────────────────────────────────────────────
export const MAX_MM_QUICK_REPLIES = 13
export const mmQuickReplySchema = z.discriminatedUnion("contentType", [
  z.object({ contentType: z.literal("text"), id: zodBigintAsString(),
             title: z.string().trim().min(1).max(20), action: mmPostbackAction }),
  z.object({ contentType: z.literal("user_phone_number"), id: zodBigintAsString(),
             action: mmPostbackAction }),
  z.object({ contentType: z.literal("user_email"), id: zodBigintAsString(),
             action: mmPostbackAction }),
])

// ── Media reference (binds to MediaLibraryOrInsertLink) ──────────────────
export const mmMediaRefSchema = z.object({
  id: zodBigintAsString(),
  mode: uploadModes,                       // "file" | "url"
  url: zodUrlWithVariables(),
  attachmentId: z.string().optional(),     // filled at save time — §9.2
})

// ── Templates ────────────────────────────────────────────────────────────
const quickReplies = z.array(mmQuickReplySchema).max(MAX_MM_QUICK_REPLIES)

export const mmContentSchema = z.discriminatedUnion("templateType", [
  z.object({ templateType: z.literal("text"),
             text: z.string().trim().min(1).max(640), quickReplies }),

  z.object({ templateType: z.literal("button"),
             text: z.string().trim().min(1).max(640),
             buttons: z.array(mmButtonSchema).min(1).max(3), quickReplies }),

  z.object({ templateType: z.literal("media"),
             mediaType: z.enum(["image", "video"]),
             media: mmMediaRefSchema,
             buttons: z.array(mmButtonSchema).max(3), quickReplies }),

  z.object({ templateType: z.literal("generic"),
             greeting: z.string().trim().max(640).optional(),
             elements: z.array(z.object({
               id: zodBigintAsString(),
               title: z.string().trim().min(1).max(80),
               subtitle: z.string().trim().max(250).optional(),   // 250, not the usual 80
               image: mmMediaRefSchema.optional(),
               buttons: z.array(mmButtonSchema).max(3),
             })).min(1).max(10),
             quickReplies }),
])
```

Notes:

- **No `performAction`, no `startAnotherNode`** (D12).
- **No `default_action`** on generic elements — it is not in Meta's documented
  payload for this API.
- Postback **payload encoding is deferred** to the send task. The button/quick
  reply `id` is the natural payload anchor; the flow package's existing
  `*_PAYLOAD_TYPE` constants (`send-message.ts`) are the precedent to follow.
- `greeting` maps to the generic payload's optional top-level `text`.

### 7.2 Form fields

| Field | Component | Source / rule |
|---|---|---|
| Name | `InputField` | `maxLength={120}` |
| Page | `SelectField` | `messengerIntegrationService.findByWorkspaceId` via oRPC → `{ pageId, name }` |
| Ad account | `SelectField` + refresh button | `getMarketingMessagesAdAccounts` via oRPC (§9.1); mirrors `ad-set-step.tsx` |
| Currency | read-only `Input` | from the selected account |
| Budget type | `SelectField` | `daily` \| `lifetime` |
| Budget | `InputNumberField` | major units, `suffix={currency}`. Validation is `> 0` only (D14) — expressed as `min = 1 / currencyOffset(currency)`, i.e. `0.01` for offset-100 currencies and `1` for offset-1 ones. This is *not* a Meta-minimum lookup; a below-minimum budget is rejected by Meta on save. |
| Content | template-type selector + per-template editor | §7.1 |

**ToS gate (D17):** when the selected account's `tos_accepted` shows the
custom-audience terms unaccepted, render an inline destructive alert and disable
submit:

> To use this feature, please accept the custom object terms at
> `https://business.facebook.com/ads/manage/customaudiences/tos/?act=<ACCOUNT_ID>`

`<ACCOUNT_ID>` is the bare `account_id` field — **not** the `id` field, which
carries the `act_` prefix.

### 7.3 Content editors

Four editors under `features/facebook-marketing-messages/components/content/`.
Reuse, not reimplementation:

- **Media**: `MediaLibraryOrInsertLink` with `parentName="media"`,
  `fileType="image" | "video"`. It binds to `{ mode, url, id }` — which is why
  `mmMediaRefSchema` has that exact shape.
- **Generic elements**: an array field whose per-element editor is
  title / subtitle / `MediaLibraryOrInsertLink` / up to 3 buttons — structurally
  the same as `sendCardStepSchema`, except the subtitle allows 250 characters
  (§10), so it wants a `Textarea` rather than the single-line input a
  card subtitle uses.
- **Buttons and quick replies**: a dialog modelled on `button-editor-dialog.tsx`
  but **free of `useReactFlow`** — no `getNodes`, `addNodes`, `setEdges`, or
  `screenToFlowPosition`. Only three (buttons) or two (quick replies) action
  choices, each a plain sub-form. Flow and node pickers come from the existing
  `startExternalFlow` / `startExternalNode` step editors.

---

## 8. Currency conversion

`features/facebook-marketing-messages/lib/currency.ts`

Meta's offset table (`developers.facebook.com/documentation/ads-commerce/marketing-api/currencies`)
gives a default offset of **100**, with these eleven exceptions at offset **1**:

```ts
const ZERO_DECIMAL_CURRENCIES = new Set([
  "CLP", "COP", "CRC", "HUF", "IDR", "ISK",
  "JPY", "KRW", "PYG", "TWD", "VND",
])

export const currencyOffset = (currency: string): number =>
  ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100

export const toMinorUnits = (major: number, currency: string): number =>
  Math.round(major * currencyOffset(currency))
```

`TWD` is offset 1 in Meta's table despite ISO 4217 giving it two decimals —
this is exactly why Meta's list is authoritative and a generic ISO helper is not
acceptable here. Both `budgetMinorUnits` and `currencyOffset` are persisted so
the conversion behind any historical row remains auditable.

---

## 9. Part 5 — Meta calls

### 9.1 Ad accounts

`integrations/facebook-ads/src/apis/ad-accounts.ts` — a **new** function, not a
change to `getAdAccounts` (whose `FacebookAdAccount` shape is consumed by the
CTM wizard):

```ts
export function getMarketingMessagesAdAccounts(
  accessToken: string,
  version: string = DEFAULT_API_VERSION,
): Promise<MarketingMessagesAdAccount[]>   // fields=name,account_id,currency,tos_accepted
```

Reuses the module's `fetchAllPages` cursor helper and `rescue()`. `tos_accepted`
comes back as a map of terms → flag; the exact key for the custom-audience terms
must be confirmed against a live response and parsed leniently (absent ⇒ treat
as not accepted, since that is the state the remediation link fixes).

Exposed to the client through
`features/facebook-marketing-messages/api/private.ts` as an `authorizedAPI`
procedure with `workspaceAuthorizedMidddleware` (**three `d`s** — invariant 1),
registered lazily in `apps/builder/src/routers/index.ts` beside
`facebookLeadAdsAPI`.

### 9.2 Attachment upload (D16)

`integrations/messenger/src/apis/attachment.ts` (new):

```
POST /<PAGE_ID>/message_attachments
  message={"attachment":{"type":"image|video","payload":{"is_reusable":true,"url":"<url>"}}}
```

Authenticated with the **Page** access token from the Messenger integration's
stored auth (`messengerIntegrationService.findByPageId(...).auth.tokens.accessToken`)
— the same source `listPageLeadForms` uses. Returns `attachment_id`, stored on
`mmMediaRefSchema.attachmentId`.

Runs **before** campaign creation so a failed upload leaves nothing created.
On edit, re-upload only when the media URL changed.

### 9.3 Message campaign

`integrations/facebook-ads/src/apis/message-campaigns.ts` (new), both wrapped in
`rescue()` and using `facebookAdsGraphClient`:

```ts
createMessageCampaign(accessToken, {
  adAccountId,            // act_<id>
  name,
  pageId,
  dailyBudget?, lifetimeBudget?,   // exactly one, minor units, > 0
  version?,
}): Promise<{ id: string }>

updateMessageCampaign(accessToken, campaignId, {
  name?, dailyBudget?, lifetimeBudget?, version?,
}): Promise<void>
```

`pixel_id`, `start_time`, `end_time` are deliberately not parameters (D10).
The response may carry `info` or `warning` alongside `id` when Meta applies an
estimated budget cap — log it, do not fail.

### 9.4 Save sequence

**Create:**

1. Zod-validate the form.
2. Resolve the grant; not `valid` → throw.
3. Re-check `tos_accepted` for the chosen ad account server-side.
4. Upload media attachment if the content is a Media template (§9.2).
5. `createMessageCampaign(...)`.
6. **Only on success**, insert the `FacebookMarketingMessage` row with the
   returned `campaignId`.
7. Redirect to the list.

**Edit:** same ordering against `updateMessageCampaign`. `adAccountId`, `pageId`,
and `campaignId` are frozen — changing the account or Page means a different
campaign, so the form renders them disabled. Content edits are local-only and
skip the Meta call unless media changed (which triggers a re-upload).

A Graph failure at step 5 surfaces Meta's own message to the user and leaves the
database untouched (D9).

---

## 10. Verified API facts

Fetched 2026-09-05 from `developers.facebook.com`. ⚠ = not documented; our own
cap, chosen for consistency with existing schemas.

| Template | Documented limits |
|---|---|
| Text | "the message can be up to 640 characters in length". Buttons and quick replies not mentioned. |
| Button | "up to three attached buttons"; types `web_url`, `postback`. Text length ⚠ → 640 by analogy. |
| Media | `media_type`: `image` \| `video`. "Either an `attachment_id` … or a `url` (Facebook URL) must be provided—not both." "You can add up to 3 buttons to a media template message". |
| Generic | "max 10" elements; "Maximum of 3 buttons are allowed per message" (error 2300026); "Supports upto 6 images" in grid; "Currently, we do not support postback buttons in video payloads." **Subtitle up to 250 characters** — Marketing Messages allows more than the usual Messenger generic-template limit, so do **not** reuse `sendCardStepSchema`'s 80. Title length ⚠ → 80, matching `sendCardStepSchema`. `default_action` absent from all examples. |
| Quick replies | "Up to 13 buttons"; title "20 character limit"; payload "1000 character limit"; `content_type` ∈ `text`, `user_phone_number`, `user_email`; optional `image_url`, "minimum of 24px x 24px". |
| Currencies | Default offset 100; offset 1 for CLP, COP, CRC, HUF, IDR, ISK, JPY, KRW, PYG, TWD, VND. |

---

## 11. Open items and follow-ups

- **O1 — `tos_accepted` shape.** Documented as a map of accepted terms. The
  exact key for the custom-audience terms must be confirmed against a live
  response before the gate ships; parse leniently and treat absence as *not
  accepted*.
- **O2 — Postback payload format.** Deferred to the send task. Whatever it is
  must round-trip through the webhook handler that already decodes the
  `*_PAYLOAD_TYPE` metadata payloads.
- **O3 — Quick replies on Text and Button templates.** Structurally valid
  (`quick_replies` is a `message`-level field) but only demonstrated on generic.
  Confirm with a live send before relying on it.
- **O4 — Video + postback.** The generic-template docs state postback buttons
  are unsupported in video payloads. The media-template docs are silent. If the
  restriction applies there too, the Media editor must hide postback actions
  when `mediaType === "video"`.
- **O5 — Token refresh.** The long-lived token lasts ~60 days with no background
  refresh. Users re-grant manually via the expired panel. A refresh job is
  worth scheduling as separate work.
- **O6 — Deleting a campaign.** Local delete only is assumed; whether it should
  also delete or pause the Meta campaign was not decided.

---

## 12. Testing

Per `AGENTS.md`, cross-boundary tests go in `apps/builder/__tests__/`; narrow
unit tests may be colocated.

- `mmContentSchema` — every cap in §10 accepted at the boundary and rejected one
  past it; each template's valid and invalid shapes.
- `currency.ts` — all eleven offset-1 currencies, a default-offset currency, and
  rounding.
- `TOOLS_CONFIG` — new entry present, positioned after `facebook-lead-ads`,
  visible without a permission (extend the existing
  `tools-list-config.test.ts`).
- Grant resolution — `missing` / `expired` / `valid`, including the
  `is_valid: false` with populated `scopes` case.
- Callback dispatch — `flow: "facebookMarketingMessages"` routes to the new
  branch and does not fall through to the page picker.
- Save sequence — a Meta rejection leaves no row; a success stores `campaignId`.

---

## 13. Invariant checklist

| Invariant | Applies |
|---|---|
| 1 — triple-`d` middleware names | `workspaceAuthorizedMidddleware` in the new oRPC API. |
| 2 — `relations/index.ts` needs TWO edits | Both new tables. |
| 7 — i18n mandatory | Every string via `useTranslations()`; check `fields.*` before adding keys. |
| 9 — no direct `db` in `apps/` | All access through `facebookMarketingMessagesService`. |
| 18(b) — tenant-aware owner | `resolveOwnerForWorkspace`, never a bare `userId`. |
| Migration safety | `make:migration` and show the SQL; **never** run `db:migrate`. |
| `no-dynamic-import` | Applies to the new `integrations/*` modules; `apps/builder/src` is exempt. |
| Gate | `pnpm lint` + `pnpm --filter builder check-types` + touched-workspace tests. |
