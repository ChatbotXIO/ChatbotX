# Messaging window

One rule decides whether a conversation still accepts a **manual** message
(`sendFrom` `inbox` or `api`, see `isManualSend`) and until when. The server
enforces it, and every client (builder UI, mobile, CLI, MCP) reads or reruns the
same function. Automation (flows, triggers, AI agents, broadcasts) keeps each
channel's own rules and is not gated by this.

No database flag: the state is computed from
`ContactInbox.lastIncomingMessageAt` (the contact's last incoming message; a
WhatsApp call also reopens the window).

## Policy per channel

`MESSAGING_WINDOW_POLICY` in `packages/sdk/src/lib/shared/messaging-window.ts`
(a `Record<ChannelType, ...>`, so a new channel must declare its window).

| Channel | Open | After that | Closed after |
|---|---|---|---|
| Messenger DM | 24 h | `humanAgent` (HUMAN_AGENT tag) | 7 days |
| Instagram DM | 24 h | `humanAgent` (HUMAN_AGENT tag) | 7 days |
| WhatsApp | 24 h | - | 24 h (templates only) |
| TikTok | 48 h | - | 48 h |
| Others | no window (`unlimited`) | | |

TikTok's 48 h comes from partner documentation (respond.io, Sleekflow, Sprinklr);
TikTok's own reference does not state it. Re-check it on a real account.

Boundaries are inclusive: exactly 24 h (or 7 days) is still inside.

## States

`resolveMessagingWindow({ channel, isDirect, lastIncomingMessageAt, now? })`
returns `{ state, changesAt, closesAt }`.

| State | Meaning | Send |
|---|---|---|
| `open` | inside the standard window | allowed |
| `humanAgent` | Meta only, past 24 h, within 7 days | allowed, tagged `HUMAN_AGENT` |
| `closed` | window over | refused |
| `unlimited` | channel without a window | allowed |
| `notApplicable` | comment conversation (`sourceId` set and not `email:`) | allowed |
| `unknown` | `lastIncomingMessageAt` missing | allowed (unchanged behavior) |

`changesAt` is the next moment the state changes, `closesAt` the moment it
closes for good; both are absolute and null when they do not apply.

## Where it is enforced

1. **Early, synchronous** - `messageService.assertManualSendWindowOpen`
   (`packages/business/src/message/assert-manual-send-window-open.ts`) throws
   `messagingWindowClosedException` (`messagingWindowClosed`, 409) before
   anything is queued, so API, CLI and MCP callers get the error at once instead
   of a 202 followed by a worker failure. It also lets a flow through whose
   first step is a WhatsApp or Messenger template. Callers: `sendOutgoing`
   (`messages.create`, `contacts.sendMessage`, the Inbox action),
   `contacts.sendFlow` and `contacts.triggerAutoReply`. It is deliberately not
   inside `createOutgoing`, so system sends cannot throw in their own flow.
2. **Last line, in the worker** - the window can close while a job waits in the
   queue:
   - Messenger / Instagram: `resolveMessagingPolicy` maps the state to
     `RESPONSE` / `HUMAN_AGENT` or the existing
     `*_human_agent_window_expired` error.
   - WhatsApp: `whatsapp_messaging_window_closed`.
   - TikTok: `tiktok_messaging_window_closed`.
   Both use `assertManualSendWindowOpen` from the sdk.

On WhatsApp, outside the window send an approved template with
`messages.sendWhatsappTemplate` (it goes through its own job and bypasses the
gate). A call permission request is a free-form message and is gated like any
other.

## Where clients read it

- **API**: every `contactInboxes[]` element of `conversations.get` and
  `conversations.list` (full and compact view) carries
  `messagingWindow: { state, changesAt, closesAt }`.
- **Builder UI** (`message-input.tsx`): reruns `resolveMessagingWindow` on the
  contact inbox already in the store, so the realtime patch of
  `lastIncomingMessageAt` reopens the composer without a refetch. A timer fires
  at `changesAt`. WhatsApp's closed banner offers the template tab.
- **Mobile** (separate repo): read `contactInboxes[].messagingWindow` and set a
  timer to `changesAt`. On a realtime `messageCreated` with
  `messageType: "incoming"`, refetch the conversation (or compute
  `closesAt = createdAt + window`), otherwise the composer stays locked after
  the contact writes. Handle `messagingWindowClosed` and the
  `*_window_expired` / `*_window_closed` codes, and drop any local 24 h / 7 day
  arithmetic. The field is additive, so older app versions keep working.

## Notes

- Clock skew can make a client lock or unlock a few seconds early; the server
  always decides.
- `messaging-window.ts` is pure (no Node-only imports): the builder router and
  schema import it (AGENTS.md invariant 25).
- `sendFrom: "api"` also covers system-made sends (e.g. order notifications):
  (order notifications, booking links, call permission requests) are now
  refused by the WhatsApp/TikTok worker gate outside the window too. Those
  callers use `createOutgoing` directly, so they get no early 409: the failure
  surfaces in the worker.
- The worker re-reads the contact inbox only for a manual send whose queued
  window reads `closed`, and patches only `lastIncomingMessageAt`, so a message
  that arrived while the job waited reopens it.
- `resolveConversationMessagingWindow` (sdk) takes the channel as a plain string
  (unknown channel: `unlimited`); the list query, the composer and the business
  gate all use it.
