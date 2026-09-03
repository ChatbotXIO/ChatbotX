# Multi-Image Messaging — Channel Capability Research

> Research notes gathered while scoping a new "Multiple images" flow step (send several
> images in one outbound message, instead of today's one-image-per-`sendImage`-step
> limit). This is **research, not a plan**. All channels below are now confirmed either way.

## Current state

`sendImageStepSchema` (`packages/flow-config/src/steps/send-image.ts`) has a single
scalar `url: zodUrlWithVariables()`. Every channel handler under
`integrations/<channel>/src/handlers/message/outgoing-message/send-*.ts` sends exactly
one image per call. No channel handler currently builds a multi-item payload.

## Channel capability matrix

| Channel | Multi-image in ONE message? | Mechanism | Max items | Confidence |
|---|---|---|---|---|
| **Instagram** (`instagram`, `instagram-facebook`) | ✅ Yes | `message.attachments` (plural array), each `{type: "image", payload: {url}}` — no title required | 10 | **Confirmed** — official docs, [Send Message — Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message) |
| **Telegram** | ✅ Yes | `sendMediaGroup` — true grouped album (grid), no title required | 10 | **Confirmed** — Telegram Bot API docs |
| **Webchat** | ✅ Yes | Custom widget; `sendMessage` (`integrations/webchat/src/handlers/message.ts`) forwards an arbitrary JSON payload over realtime — no platform constraint at all | n/a | **Confirmed** — internal, our own protocol |
| **Messenger** (`messenger`) | ✅ Yes | Same `message.attachments[]` array as Instagram (`{type: "image", payload: {url}}[]`) — no title required. Documented under the `#sending_multiple_attachments` anchor of the Send Messages page; our own WebFetch pass missed the anchor'd section (page-to-markdown conversion appears to drop anchor-scoped content), confirmed instead from a user-supplied curl example matching Meta's official placeholder format | 10 (same as Instagram) | **Confirmed** — [Send Messages — Messenger Platform § Sending multiple attachments](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages#sending_multiple_attachments) |
| **WhatsApp** (Cloud API) | ❌ No | Multi-image "carousel" only exists for pre-approved **Marketing Templates**; the free-form message object (`whatsapp-api-js` `Image`) carries exactly one media object | 1 | **Confirmed** — matches code, and independently verified by the user |
| **Zalo** (OA) | ❌ No | Codebase's own schema hard-caps it: `elements: z.array(mediaAttachmentTemplate).max(1)` (`integrations/zalo/src/schema/webhook.ts:44`) | 1 | **Confirmed** — matches code, and independently verified against Zalo OA docs by the user |
| **TikTok** | ❌ No | Schema is a single scalar object `image: { media_id: string }` (`integrations/tiktok/src/schema.ts`), no array | 1 | **Confirmed** — matches code, and independently verified by the user |

## Key nuance: two different "multi-image" UX shapes

1. **Album / grid** (Telegram `sendMediaGroup`, Instagram `attachments[]`) — images render
   together, no per-image caption/title needed. This is what users mean by "gửi nhiều ảnh
   trong 1 tin nhắn".
2. **Carousel** (Messenger/Instagram Generic Template `elements[]`) — horizontally
   swipeable cards, each **requires a `title`**. Structurally different UX and payload
   shape; would need its own step type if we ever want carousel-with-buttons, separate
   from a plain multi-image step. (This codebase already has that step: `sendCarousel`.)

For the "Multiple images" step being scoped, shape (1) is the target.

- **Confirmed native support (album, one message):** Instagram, Messenger, Telegram, Webchat
- **Confirmed no native support (must fall back to N sequential `sendImage` calls):** WhatsApp, Zalo, TikTok

Research is complete — every channel is resolved. A "Multiple images" step needs a
per-channel capability flag: native `attachments[]`/`sendMediaGroup` for the first group,
sequential single-image sends for the second.

**Implementation status:** built — see `.plans/send-multiple-images-step.md` for the
step (`sendMultipleImages`) and the exact per-channel wiring.

## Sources

- [Send Message — Instagram Messaging (Business Messaging docs)](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message) — confirms `attachments[]`
- [Send Messages — Messenger Platform (Business Messaging docs) § Sending multiple attachments](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages#sending_multiple_attachments) — confirms `attachments[]`
- [Attachment Upload API — Instagram Messaging](https://developers.facebook.com/docs/messenger-platform/instagram/features/attachment-upload/)
- [Generic Template — Messenger Platform](https://developers.facebook.com/docs/messenger-platform/send-messages/template/generic)
- [Generic Template — Instagram](https://developers.facebook.com/docs/messenger-platform/instagram/features/generic-template/)
