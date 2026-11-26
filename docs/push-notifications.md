# Push notifications

Mobile push delivery via the **Expo Push Service**. A mobile client (Expo/React
Native) registers a device token; the `notification` BullMQ queue/worker sends
push notifications for new inbound messages and conversation assignment.

## Architecture

```
receiveMessage (integration worker)
  → notificationQueue.add(notifyIncomingMessage)
  → notification worker (src/notification/worker.ts)
    → resolveRecipientUserIds
    → deviceTokenService.findByUserIds
    → buildNotificationContent (localized title/body)
    → expo.sendPushNotificationsAsync
    → prune stale/invalid tokens
```

Conversation assignment (`conversationService.updateAssignment`) enqueues
`notifyConversationAssigned` directly, guarded so the assigning user is never
notified about their own assignment (`assignedUserId !== assignedBy`).

See `docs/request-workflow.md` for the sequence diagram.

## `UserDeviceToken` lifecycle

- **Register** — `PUT /users/me/device-tokens` (`apps/builder/src/features/device-tokens/api/private.ts`).
  Upserts on `token` (globally unique — a token moves between users across
  re-logins on the same device, so it is not scoped per-user at the DB level).
  Requires workspace membership when `workspaceId` is provided (403 otherwise).
- **Unregister** — `DELETE /users/me/device-tokens`. Scoped by both `token`
  and the caller's `userId` — one user cannot delete another's token.
- **Stale-token pruning** — when Expo reports a delivery ticket with
  `details.error === "DeviceNotRegistered"`, or a token fails
  `Expo.isExpoPushToken` format validation, it is deleted via
  `deviceTokenService.deleteByTokens`.

## Recipient resolution

`resolveRecipientUserIds` (`apps/worker/src/notification/handlers/send-push.ts`):

- `notifyConversationAssigned` → the assigned user only.
- `notifyIncomingMessage` → the conversation's assigned user if set, else every
  workspace member (unassigned conversations fan out to the whole workspace —
  noisy for large workspaces but acceptable for v1).
- An optional `excludeUserId` on the job payload filters the acting user out
  of the recipient list — used when a channel's echo/coexist sync can
  round-trip an agent's own outbound reply back as an "incoming" message.
  Optional because most channels have no way to identify the sending user.

## Content localization

`buildNotificationContent` (`apps/worker/src/notification/lib/build-notification-content.ts`)
resolves copy from `apps/worker/src/notification/lib/strings.ts`, keyed by
`Workspace.language`. `resolveLocale` falls back to `en` for any language not
in the string table.

## Env vars

| Var | Purpose |
|-----|---------|
| `EXPO_ACCESS_TOKEN` | Optional. Only needed if Expo's "enhanced push security" is enabled on the project; unauthenticated requests work otherwise. |
| `EXPO_PUSH_ENABLED` | Kill switch, default `true`. Accepts `z.stringbool()` values (`"true"`/`"1"`/`"yes"`/`"on"` vs `"false"`/`"0"`/`"no"`/`"off"`) — unlike FCM, Expo needs no credential to send, so there is no natural "unset = disabled" signal; operators flip this explicitly. |
| `NOTIFICATION_WORKER_CONCURRENCY` | BullMQ worker concurrency, default `10`. |

When disabled, `getExpoClient()` (`apps/worker/src/notification/lib/expo.ts`)
returns `null` and `sendPushForNotificationJob` returns early — the job still
completes successfully, it just sends nothing.

## Composed posts (`postFailed`, `postNeedsReview`)

Two member notification types, toggled in the member settings next to "New
order": `notificationTypes.postFailed` and `notificationTypes.postNeedsReview`.
`announceSettledTarget` (`packages/business/src/social-post/notify.ts`) enqueues
`notifyPostFailed` / `notifyPostNeedsReview` after a target's `failed` /
`needsReview` result is stored; the job id is `social-post-<action>-<targetId>-<attempt>`.
`notifyPostTarget` (`apps/worker/src/notification/handlers/notify-post-target.ts`)
sends to members with the type on and the Posts (`broadcast`) permission, with a
localized title (`strings.ts`) and the destination name and error as the body.
Rows stored before these keys have none, which counts as off. See `docs/posts.md`.

## Publishing connections (`publishConnection`)

A third post-related member notification type. `announcePublishConnectionAttention`
(`packages/business/src/publish-destination/notify-attention.ts`) enqueues
`notifyPublishConnection` when a destination's token is rejected, a TikTok login
needs reauth, a publishing permission is missing, or the destination is paused
by the circuit breaker; `notifyPublishConnection` sends to members with the type
on and the Posts (`broadcast`) permission. See `docs/posts.md`.
