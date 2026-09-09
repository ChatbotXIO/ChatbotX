# @chatbotx.io/integration-instagram-facebook

Instagram DM and post-comment integration via the Facebook Graph API.

Integration name in code: **`instagramFacebook`**

---

## Overview

This integration connects Instagram Business or Creator accounts to ChatbotX through the Facebook Graph API (Meta). It supports two channels:

- **DMs** — real-time private messaging with Instagram users
- **Post comments** — receive new comments on Instagram posts, and reply/hide/like/delete them

Personal Instagram accounts are not supported (filtered during the OAuth account-selection step).

---

## Prerequisites

- A **Meta/Facebook Developer App** with the following permissions granted:
  - `instagram_basic`
  - `instagram_manage_comments`
  - `instagram_manage_engagement`
  - `instagram_manage_messages`
  - `pages_manage_metadata`
  - `pages_show_list`
  - `pages_messaging`
  - `pages_read_engagement`
  - `business_management`
- The Instagram account must be a **Business** or **Creator** account linked to a Facebook Page.
- Platform credentials (App ID + App Secret) stored in ChatbotX settings.

---

## OAuth flow

1. `generateAuthUrl()` builds a Facebook OAuth dialog URL with the required scopes.
2. The user authorises the app; Facebook redirects back with a short-lived `code`.
3. `exchangeCodeForToken()` exchanges the code for a short-lived token, then immediately exchanges that for a **long-lived page access token** via `exchangeLongLivedToken()`.
4. `getUserInstagramAccounts()` queries `/me/accounts` for all Facebook Pages the user manages, then fetches the linked Instagram Business/Creator account for each.
5. The user selects an account in the UI; the page access token and Instagram metadata (`igId`, `igName`, `pageId`, `version`) are stored in `auth.metadata`.
6. `subscribePageToInstagramWebhook()` subscribes the chosen page to the Instagram webhook fields.

**Stored auth shape:**

```ts
type InstagramAuthValue = Oauth2AuthValue & {
  metadata: {
    igId: string       // Instagram business account ID (IGID)
    igName: string     // Instagram display name
    pageId: string     // Facebook Page ID
    version: string    // Graph API version, e.g. "v23.0"
  }
}
```

**Disconnect** calls `unsubscribePageFromInstagramWebhook()` to remove the page subscription.

---

## Webhook handling

Webhooks are verified using HMAC-SHA256 (`x-hub-signature-256` header) against the app secret.

### Subscription verification (GET)

Returns `hub.challenge` when `hub.verify_token` matches `config.verifyToken`.

### DM events (POST — `messaging` array)

| Event | Queue job |
|---|---|
| Incoming message / postback | `incomingMessage` |
| Message read receipt | `contactMarkAsRead` |

Echo messages sent by the bot itself (identified by `is_echo === true` + `metadata === "SENT_FROM_CHATBOTX"`) are silently dropped.

### Post comment events (POST — `changes[].field === "comments"`)

Validated with `instagramCommentEventValueSchema`. Queued as `incomingComment` with:

```ts
{
  commentId, postId, parentId?, fromId, fromName, message?, createdTime
}
```

> Instagram only fires webhooks for **new** comments — no edit or delete events.

---

## Outgoing messages (DMs)

All outgoing messages are sent to `POST /<version>/me/messages`.

| Content type | Supported |
|---|---|
| Text | ✅ |
| Image | ✅ |
| Video | ✅ |
| Audio | ✅ |
| File | ✅ |
| Quick replies (up to 13) | ✅ |
| Generic carousel (up to 3 buttons/element) | ✅ |
| GIF | ✅ |

Each message is stamped with `metadata: "SENT_FROM_CHATBOTX"` so echo events can be filtered.

---

## Comment actions

| Handler | API call | Notes |
|---|---|---|
| `sendComment` | `POST /<version>/<commentId>/replies` | Requires `contentAttributes.replyToCommentId` |
| `deleteComment` | `DELETE /<version>/<commentId>` | |
| `hideComment` | `POST /<version>/<commentId>?hide=true\|false` | |
| `likeComment` | `POST /<version>/<igId>/likes` | Toggle via POST/DELETE |
| `editComment` | — | No-op; Facebook API does not support editing comments |
| `sendPrivateReply(Message)` | `POST /<version>/<pageId>/messages` | `recipient: { comment_id }`. **Page** node — see below |

Messaging edges use the **Page** node (`<pageId>/messages`, `<pageId>/message_attachments`, `me/messages`);
Instagram content edges use the **IG** node (`<igId>/media`, `<igId>/stories`, `<igId>/likes`). Posting a
private reply to `<igId>/messages` fails with `(#3) Application does not have the capability to make this
API call.` regardless of granted permissions, because Meta does not expose that edge on the IG node for
Facebook-Login connections. The Instagram Login package (`integrations/instagram`) uses `me/messages` on
`graph.instagram.com` instead.

---

## Error handling

All API errors are normalised by `mapToChannelError()` into a typed `ChannelError` with one of these categories:

| Category | Trigger |
|---|---|
| `AUTH_FAILED` | Error code 190; `OAuthException` type as a last-resort fallback |
| `RATE_LIMITED` | Codes 4, 17, 613; subcode 2207051 |
| `QUOTA_EXCEEDED` | Code 9; subcodes 2018028, 2207042 |
| `USER_BLOCKED` | Code 551; subcode 1545041 |
| `PERMISSION_DENIED` | Codes 3, 10, 24, 25, 368; codes 200–299; subcode 2207050 |
| `PAYLOAD_INVALID` | Codes 1, 100, 352, 9004, 9007, 36000–36004; subcodes 2207020, 2207052 |
| `NETWORK_ERROR` | Codes −1, −2 |
| `INVALID_RECIPIENT` | Subcode 2018001 |

Code 3 (`Application does not have the capability to make this API call`) arrives as an
`OAuthException` but is a capability/endpoint problem, not a token problem — it is mapped to
`PERMISSION_DENIED` so it is treated as permanent and never sends the operator off to reconnect.

`isRevokedTokenError(error)` returns `true` only for error code 190 **with** a revoked subcode
(458, 460, 463, 467), triggering the upstream re-auth flow. A bare 190 is ambiguous and is
deliberately excluded to avoid false-positive disconnects, matching `integrations/instagram`.

---

## Key files

```
src/
  integration.ts                     ← IntegrationDefinition config
  schemas.ts                         ← Zod schemas + TypeScript types
  constants.ts                       ← API_URL, DEFAULT_API_VERSION (v23.0)
  exception.ts                       ← InstagramException hierarchy + rescue()
  index.ts                           ← public exports
  apis/
    auth.ts                          ← generateAuthUrl, exchangeCodeForToken, getUserInstagramAccounts
    page.ts                          ← sendInstagramMessage, subscribe/unsubscribe, profile management
    comment.ts                       ← sendComment, deleteComment, hideComment, likeComment
    post.ts                          ← getPostDetails (action exposed to the platform)
    contact-profile.ts               ← fetch contact name/avatar
    attachment.ts                    ← upload attachment by URL
    user.ts                          ← fetch Instagram user info
  handlers/
    webhook.ts                       ← signature verification, event routing
    message/
      incoming-message.ts            ← receiveMessage
      outgoing-message/              ← sendMessage, sendFlowStep, per-type converters
    comment/
      actions.ts                     ← deleteComment, hideComment, likeComment, editComment (no-op)
      outgoing-comment/index.ts      ← sendComment
    contact.ts                       ← resolveContact
    conversation.ts                  ← resolveConversation
    bot.ts                           ← bot profile helpers
  lib/
    http-client.ts                   ← InstagramHttpClient (ky-based, auto-retry)
    error-mapper.ts                  ← mapToChannelError, isRevokedTokenError
    webhook.ts                       ← hmacSha256Hex, timingSafeStringEqual
    logger.ts                        ← scoped pino logger
```

---

## API version

Default: `v23.0` (`DEFAULT_API_VERSION` in `constants.ts`). The version is stored in `auth.metadata.version` so it can be pinned per integration instance.

> **Known inconsistency:** `apis/page.ts` (`sendInstagramMessage`, the `messenger_profile` helpers)
> reads the version off `auth.version`, which the connect flow never writes — it only writes
> `auth.metadata.version`. Those calls therefore always fall back to `DEFAULT_API_VERSION`, while
> `apis/comment.ts` and `apis/attachment.ts` (which read `auth.metadata.version`) use the version the
> UI configured. `integrations/instagram` reads `metadata.version` everywhere and is unaffected.
