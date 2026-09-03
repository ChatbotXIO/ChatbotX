# Implementation Plan (v4): Messenger single image/video — deliver by URL (inline attachment) instead of media template + attachment_id

> v4 — implementation review (Codex code review C1 → C2 APPROVE,
> typescript-reviewer APPROVE): typed test fixtures via
> `sendImageStepDefaultFn` / `sendVideoStepDefaultFn` / `buttonStepDefaultFn`;
> private-anchor test matrix (inline image/video, inline + quick replies,
> buttons fallback via private reply); JSDoc moved onto the exported
> function; `convertInlineMedia` is a sync generator (Biome `useAwait`);
> `facebookElementSchema` change tried and reverted (§2.2 note).
>
> v3 applies Codex round 2: §2.5 wording (legacy upload failure *is* logged
> at `send-media.ts:51-52`, just never surfaced as `message:failed`), corrected
> citations (`send-media.ts:51-52`, `send-flow-step.ts:768` for `sourceId`),
> test 4.2.14 now mocks the exact Graph error shape `mapToChannelError`
> parses (`{ response: { error } }`, as `send-flow-step-comment-anchor.test.ts:242-250`)
> and asserts the mapped `code`/`subCode`; source comment reworded (generic
> template is an alternative for images, not for video, and needs a title).
>
> v2 applied Codex review round 1: corrected the §1.1 attachment-id claim,
> the dispatcher change description (import + `await (yield*)` form), and the
> worker failure-semantics wording (local row pre-created, `message:sent`
> emitted even when the legacy converter yields nothing); dropped the
> type-widening escape hatch; `withQuickReplies` removed from scope (listed as
> follow-up) so the change touches no old file; strategy table kept but
> trimmed (owner rule: business logic via object/table) with the objection
> recorded in §7; tests expanded (video + quick replies, empty `buttons: []`,
> fallback upload failure preserved, private-reply recipient + metadata).

## 1. Requirements Restatement

### 1.1 Problem (root cause, verified 2026-09-03)

The **Send Image** and **Send Video** flow steps on Messenger are delivered by
`integrations/messenger/src/handlers/message/outgoing-message/send-media.ts`
(`convertFlowStepMedia`) as:

1. `POST /me/message_attachments` `{ is_reusable: true, url }` → `attachment_id`
2. `POST /me/messages` with `attachment.type = "template"`,
   `template_type = "media"`, `elements[0].attachment_id`.

Recipients **without a role on the Page/App** see, on messenger.com (web):

> "File đính kèm không được hỗ trợ — File đính kèm này có thể đã bị gỡ hoặc
> người chia sẻ không có quyền chia sẻ với bạn."

Verified by the owner with raw Graph API calls (no ChatbotX code involved):

| Payload sent via Graph API Explorer (page `1178975828637770`, `is_published: true`) | API result | messenger.com (no-role user) |
|---|---|---|
| `template/media` + `attachment_id` (current code path) | `message_id` returned | **not rendered** (attachment unavailable) |
| `attachment {type:"image", payload:{url, is_reusable:true}}` | `message_id` returned | **rendered** |
| `template/generic` + `image_url` + 2 buttons | `message_id` returned | **rendered** |
| `message_attachments` with `is_public:true` | `(#100) Invalid keys "is_public"` | n/a |

Ruled out: app permissions (`pages_messaging` is advanced + live on app
`894156910972023`), Page not published, app/page restrictions (none).
`is_public` does not exist on the public API.

Same flow, same Page, same CDN: **Send Multiple Images**
(`send-multiple-images.ts`), **Send GIF** (`send-gif.ts`) and inbox
attachments (`convertMessageToFacebookMessage` in `outgoing-message/index.ts`)
send `payload.url` directly and render correctly.

Scope precision: two Messenger paths upload first and then reference the
returned `attachment_id`:

- `send-media.ts` (`sendImage` / `sendVideo`) → **media template** referencing
  the id. Proven broken above. **In scope.**
- `send-file.ts` (`sendAudio` / `sendFile`) → **plain attachment**
  `{ type, payload: { attachment_id } }`. Not tested, not proven broken.
  **Out of scope** (§1.5, §6).

### 1.2 Meta documentation (checked via Meta Developer MCP, 2026-09-03)

- Send a media attachment — the canonical single-image request is
  `attachment: { type: "image", payload: { url, is_reusable: true } }` with a
  **non-Facebook URL**; "Sending audio, video, or a file from a URL will use
  the same format."
  <https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages>
- Attachment Upload API — URL fetch limits: images 8 MB, other types 25 MB,
  10 s fetch timeout (75 s for video); errors `100/2018008` (fetch failed),
  `100/2018047` (upload failure). "Attachments in the user's message thread
  are always private." Reusable `attachment_id` expires after 90 days.
  <https://developers.facebook.com/docs/messenger-platform/reference/attachment-upload-api/>
- Media template — "does not allow any external URL, only Facebook URLs"; an
  external URL must go through the Attachment Upload API and `attachment_id`.
  That constraint is the *only* reason the current code uploads first.
  <https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/template/media>
- Generic template — `image_url` accepts external URLs, `title` (≤ 80 chars)
  is required, up to 3 buttons, image cropped/scaled to 1.91:1 (or 1:1 with
  `image_aspect_ratio: "square"`). Video needs a Facebook `video_id`.
  <https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/template/generic>

`is_reusable` on a one-step upload-and-send: the Send-a-Message page shows
`is_reusable: true` in its example; the Attachment Upload reference says "Do
not set to true if you upload and send in one API call" (it only controls
whether Meta *also* returns a reusable `attachment_id`). Both forms are
accepted. The existing shared helper `getAttachmentTemplate`
(`send-attachment.ts:5`) sets `is_reusable: true` and is already used in
production by the inbox path and the Messenger Ads JSON path; the owner's
manual test used the same body. **Decision: reuse the helper unchanged.**

### 1.3 Industry reference (GitHub, checked 2026-09-03)

- Chatwoot `app/services/facebook/send_on_facebook_service.rb` — single
  attachment: `{ attachment: { type, payload: { url } } }`, no upload, no
  template.
- Bottender — `sendImage` = plain attachment; `sendMediaTemplate` is a separate
  API used only when the caller explicitly wants a template.
- `aliahdab2/jawab24#460` (07/2026) retired the generic-template card for images
  in favour of a native image attachment (uncropped, tap-to-fullscreen).
- `AI-Beat-Automations/resender#46` (08/2026) — new Messenger attachment
  design is URL-only.
- `Cloudkibo/KiboPush#6280` — media-template echoes carry only `attachment_id`
  (no URL), confirming the template references an object rather than embedding
  the media.

### 1.4 Deliverables

1. **New converter** `send-media-v2.ts` (Messenger only). For `sendImage` /
   `sendVideo` steps **without buttons**, yield the inline attachment
   `{ type: image|video, payload: { url, is_reusable: true } }` built by the
   existing `getAttachmentTemplate`, with node quick replies attached exactly
   as the GIF path does. No Attachment Upload call.
2. Steps **with buttons** keep the current media-template path by delegating
   to the unchanged `convertFlowStepMedia` (old file is not modified, including
   its swallow-on-upload-failure behaviour). Rationale: a plain attachment
   cannot carry buttons; the generic template needs a `title` the step schema
   does not have; a video with buttons has no alternative at all.
   See §6 for the follow-up.
3. **Dispatcher switch** — `convertFlowStepToFacebookMessage` in
   `outgoing-message/index.ts` routes `sendImage` / `sendVideo` to the v2
   converter (import at L47 + case at L502-508). Rollback = revert those two
   hunks.
4. **Tests** covering every branch (§4).

### 1.5 Non-goals (explicitly out of scope)

- `send-file.ts` (`sendAudio` / `sendFile`) — see §1.1 scope precision.
- `integrations/instagram-facebook/.../send-media.ts` — identical media
  template code for Instagram-via-Facebook. Different client; separate
  verification and plan.
- Inbox (`sendMessage`), GIF, multiple images, carousel, Messenger Ads JSON —
  already URL-based; unchanged.
- Flow-config schema, builder editors, i18n — unchanged.
- The `quickReplies.length > 0 ? { quick_replies } : {}` spread is duplicated
  in four existing converters. Consolidating it means editing old files, which
  the owner ruled out for this change → §6 follow-up. v2 uses the same
  spread as `send-gif.ts` so the convention stays single.

## 2. Design

### 2.1 Files

| File | Change |
|---|---|
| `integrations/messenger/src/handlers/message/outgoing-message/send-media-v2.ts` | **new** — `convertFlowStepMediaV2` |
| `integrations/messenger/src/handlers/message/outgoing-message/index.ts` | import (L47) + `sendImage` / `sendVideo` case (L502-508) → `convertFlowStepMediaV2` |
| `integrations/messenger/__tests__/send-media-v2.test.ts` | **new** |
| `integrations/messenger/src/handlers/message/outgoing-message/send-media.ts` | **unchanged** (still used for the buttons branch) |

### 2.2 `send-media-v2.ts`

```ts
import type {
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { FacebookMessage, MessengerAuthValue } from "../../../schema"
import { convertMediaType, getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepMedia } from "./send-media"
import { convertCanonicalFacebookQuickReplies } from "./send-quick-replies"

type MediaStepProps = SendFlowStepProps<
  MessengerAuthValue,
  SendImageStepSchema | SendVideoStepSchema
>

type MediaConverter = (props: MediaStepProps) => AsyncGenerator<FacebookMessage>

/**
 * A single image/video step is sent inline (`attachment.payload.url`; Meta
 * fetches the file and embeds it in the thread). A step with buttons keeps
 * the existing media-template converter: a plain attachment cannot carry
 * buttons, the generic template needs a title this step does not have and
 * cannot show a video by URL, and the media template rejects external URLs,
 * hence its upload → `attachment_id` round-trip.
 */
const mediaDeliveryModes = {
  inline: "inline",
  mediaTemplate: "mediaTemplate",
} as const
type MediaDeliveryMode =
  (typeof mediaDeliveryModes)[keyof typeof mediaDeliveryModes]

const resolveMediaDeliveryMode = (
  step: MediaStepProps["data"]["step"],
): MediaDeliveryMode =>
  step.buttons.length > 0
    ? mediaDeliveryModes.mediaTemplate
    : mediaDeliveryModes.inline

async function* convertInlineMedia(
  props: MediaStepProps,
): AsyncGenerator<FacebookMessage> {
  const { step, quickReplies = [] } = props.data
  yield {
    attachment: getAttachmentTemplate(step.url, convertMediaType(step.stepType)),
    ...(quickReplies.length > 0
      ? { quick_replies: convertCanonicalFacebookQuickReplies(quickReplies) }
      : {}),
  }
}

const mediaConverters: Record<MediaDeliveryMode, MediaConverter> = {
  inline: convertInlineMedia,
  mediaTemplate: convertFlowStepMedia,
}

export async function* convertFlowStepMediaV2(
  props: MediaStepProps,
): AsyncGenerator<FacebookMessage> {
  yield* mediaConverters[resolveMediaDeliveryMode(props.data.step)](props)
}
```

Design notes:

- **Table-driven dispatch** (`Record<MediaDeliveryMode, MediaConverter>`),
  per the owner's rule that business logic is expressed as an enum/object,
  not an if/else chain. `MediaConverter` returns
  `AsyncGenerator<FacebookMessage> | Generator<FacebookMessage>`: the inline
  converter has nothing to await so it is a sync generator (Biome's
  `useAwait` rejects an `async function*` without `await`), while the legacy
  converter stays async; `yield*` inside the async wrapper handles both. Codex round 1 considered this over-designed for a
  two-way branch; kept by owner rule, recorded in §7.3.
- **Yielded type is the real top-level message type** `FacebookMessage`
  (`schema.ts:374-384`), not the dispatcher's historical
  `FacebookMessageAttachmentPayload | FacebookMessage` union. Assigning
  `convertFlowStepMedia` to `MediaConverter` must compile as-is: its media
  element carries `media_type` / `attachment_id`, which `facebookElementSchema`
  (`schema.ts:308-320`) does not declare, but non-fresh objects with extra
  properties are assignable. `check-types` passes as-is.
  Tried during code review (Codex round C1): adding
  `media_type: z.enum(["image", "video"])` + `attachment_id` to
  `facebookElementSchema` for wire fidelity. Rejected: the untouched legacy
  converter passes `media_type: FileType` (`image | video | audio | file`),
  so the Meta-accurate enum no longer type-checks against it, and widening
  the enum to `FileType` would misstate Meta's media-template contract.
  Schema left unchanged; revisit when `send-media.ts` itself is reworked
  (§6.1).
- **Reuses existing handlers**: `getAttachmentTemplate`, `convertMediaType`,
  `convertFlowStepMedia`, `convertCanonicalFacebookQuickReplies`. No new
  Graph API client code.
- No `any`. Not a shared-channel file (lives under `integrations/messenger`).
- Comment is limited to the technical constraint; no environment-specific
  rendering claims in source.

### 2.3 Dispatcher change (`outgoing-message/index.ts`)

```ts
// L47
import { convertFlowStepMediaV2 } from "./send-media-v2"   // replaces ./send-media import

// L502-508
case stepTypes.enum.sendImage:
case stepTypes.enum.sendVideo:
  await (yield* convertFlowStepMediaV2(
    props as SendFlowStepProps<
      MessengerAuthValue,
      SendImageStepSchema | SendVideoStepSchema
    >,
  ))
  break
```

The `await (yield* …)` form is kept exactly as the existing code uses it
(same as the `sendAudio` / `sendFile` case) so the diff is limited to the
callee name.

### 2.4 Behaviour matrix after the change

| Step | Buttons | Quick replies | Graph calls | Payload |
|---|---|---|---|---|
| sendImage | `[]` | none | 1 (`/me/messages`) | `attachment {image, {url, is_reusable:true}}` |
| sendImage | `[]` | yes | 1 | same + `quick_replies` |
| sendVideo | `[]` | none | 1 | `attachment {video, {url, is_reusable:true}}` |
| sendVideo | `[]` | yes | 1 | same + `quick_replies` |
| sendImage / sendVideo | ≥ 1 | any | 2 (upload + send) | **unchanged** media template (old code) |

`buttons` is a required array on both step schemas
(`packages/flow-config/src/steps/send-image.ts:14`, `send-video.ts:12`), so
`length > 0` is the complete discriminator.

### 2.5 Failure semantics (behaviour change — owner to confirm, §7.1)

**Today (buttons or not):** the worker creates the local `Message` row before
dispatch (`apps/worker/src/chat/handlers/send-flow-step.ts` ~L604-660), then
calls the channel. An upload failure inside `convertFlowStepMedia` is caught
and written to the worker log (`logger.error`, `send-media.ts:51-52`) and the
generator yields nothing, so `sendFlowStep` returns `{ messageIds: [] }`
**without throwing**; the worker then emits `message:sent`
(`send-flow-step.ts:762-770`) with `sourceId: undefined`
(`send-flow-step.ts:768`). Net effect: nothing reaches the recipient, the
conversation shows a sent bot message, no `message:failed` event is emitted
and no send error is persisted — the only trace is the log line.

**After (no-button branch only):** the URL fetch happens inside
`POST /me/messages`; a bad URL surfaces as a Graph error (`100/2018008`)
→ `mapToChannelError` → `sendFlowStep` throws → worker catch
(`send-flow-step.ts:814-…`) emits `message:failed` (`willRetry: false`,
terminal), calls `recordMessageSendError`, no BullMQ retry. This is the path
GIF, multiple-images and inbox attachments already take. **No try/catch in
v2** (project rule: never silently swallow errors).

**After (buttons branch):** unchanged — upload failure still swallowed, still
`message:sent`. Locked by test 4.1.8 so the legacy contract is provably kept.

### 2.6 Load / rate-limit impact

Removes one Graph API round-trip per image/video step (the upload) for the
default configuration (no buttons). Neutral for the buttons branch. No new DB
access, no new queue, no new state, no new dependency.

## 3. Implementation Phases

### Phase 1 — converter (TDD)

- [x] Write `integrations/messenger/__tests__/send-media-v2.test.ts` §4.1 (red).
- [x] Create `send-media-v2.ts` as in §2.2 (green).
- [x] `pnpm --filter @chatbotx.io/integration-messenger check-types` — passed
      as-is; `facebookElementSchema` untouched.

### Phase 2 — dispatcher

- [x] Add §4.2 tests (red).
- [x] Switch import + case in `outgoing-message/index.ts` (green).

### Phase 3 — verification gate (`.agents/skills/testing-workflow`)

- [x] `pnpm lint`
- [x] `pnpm --filter @chatbotx.io/integration-messenger check-types`
- [x] `pnpm --filter @chatbotx.io/integration-messenger test` (32 files, 235 tests) (coverage ≥ 80 %,
      no threshold skip)
- [x] `invariant-guard` subagent on the diff — PASS.
- [ ] Manual (owner, page `Chatbot XXX01`, no-role recipient, messenger.com
      web **and** Messenger mobile): Send Image no buttons → renders; Send
      Video no buttons → renders; Send Image with 1 button → unchanged
      behaviour; node quick replies still appear under the inline image.

## 4. Tests (all cases)

Location: `integrations/messenger/__tests__/send-media-v2.test.ts`, AAA style.
Mocks: `vi.mock("../src/apis/message")` for `sendPageMessage`,
`vi.mock("../src/apis/attachment")` for `uploadAttachment` (needed for every
fallback test — `send-multiple-images.test.ts` alone mocks only
`sendPageMessage`), `vi.mock("../src/apis/comment")` for
`sendPrivateReplyMessage` in test 4.2.13, logger mocked. Quick-reply fixtures
mirror `quick-replies-attachment.test.ts`.

### 4.1 Unit — `convertFlowStepMediaV2` (collect the async generator)

1. `sendImage`, `buttons: []`, no quick replies → yields exactly one message
   `{ attachment: { type: "image", payload: { url, is_reusable: true } } }`;
   `uploadAttachment` not called; no `quick_replies` key.
2. `sendVideo`, `buttons: []`, no quick replies → `type: "video"`, same shape.
3. `sendImage`, `buttons: []`, node quick replies (postback + url) →
   `quick_replies` equals `convertCanonicalFacebookQuickReplies(quickReplies)`.
4. `sendVideo`, `buttons: []`, node quick replies → same assertion for video.
5. `url` forwarded verbatim (worker already interpolated `{{variables}}`).
6. `sendImage`, 1 button → `uploadAttachment` called once with
   `(auth, url, "image")`; yields `template_type: "media"`,
   `elements[0].attachment_id === "attachment-1"`, `elements[0].buttons` from
   `convertFacebookButtons` (legacy payload preserved).
7. `sendVideo`, 1 button → media template with `media_type: "video"`.
8. **Legacy failure contract**: `sendImage`, 1 button, `uploadAttachment`
   rejects → generator yields **nothing**, does **not** throw, `logger.error`
   called once (proves the buttons branch keeps `send-media.ts` semantics).
9. `sendImage`, 1 button, node quick replies → media template **and**
   `quick_replies`.

### 4.2 Integration — `sendFlowStep` (dispatcher wiring)

10. `sendImage`, `buttons: []` → exactly one `sendPageMessage` call;
    `payload.recipient.id` = PSID; `payload.message.attachment` is the inline
    image; `payload.message.metadata === MESSENGER_MESSAGE_METADATA`;
    `messaging_type: "RESPONSE"`; `uploadAttachment` not called; result
    `{ messageIds: ["m_1"] }`.
11. `sendVideo`, `buttons: []` → one call, inline video.
12. `sendImage` with 1 button → `uploadAttachment` once, then one
    `sendPageMessage` carrying the media template (fallback wiring).
13. Private-reply anchor (`commentAnchor: { replyChannel: "private",
    commentId }`) with `sendImage`, `buttons: []` → `sendPrivateReplyMessage`
    called once with `(auth, commentId, inlineMessage, personaId)`;
    `sendPageMessage` not called. The `metadata` stamp is
    `sendPrivateReplyMessage`'s own responsibility (`comment.ts:144`) and is
    already asserted against the real API body with MSW in
    `send-private-reply.test.ts:51`; this test asserts only the routing and
    the inline attachment passed as the third argument.
14. `sendPageMessage` rejects with the Graph error shape
    `mapToChannelError` parses (`parseOriginError` explicit branch,
    `exception.ts:72-83`):
    `{ response: { error: { code: 100, error_subcode: 2018008, message: "Failed to fetch the file from the url" } } }`
    — same fixture style as `send-flow-step-comment-anchor.test.ts:242-250` —
    for `sendImage`, `buttons: []` → `sendFlowStep` rejects with a
    `ChannelError` whose `code === 100` and `subCode === 2018008`;
    `uploadAttachment` never called.
15. `sendImage` with 1 button, `uploadAttachment` rejects → `sendFlowStep`
    resolves `{ messageIds: [] }`, `sendPageMessage` not called (end-to-end
    proof of the preserved legacy contract, §2.5).

### 4.3 Regression (must stay green, unchanged)

- `quick-replies-attachment.test.ts` — its `convertFlowStepMedia` rows prove
  the old converter is untouched.
- `send-multiple-images.test.ts`, `send-message-multiple-images.test.ts`,
  `messenger-ads-json.test.ts`, `send-private-reply.test.ts`,
  `send-flow-step-comment-anchor.test.ts`.

## 5. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Meta fetch timeout (10 s image / 75 s video) on a slow CDN now fails the send instead of silently dropping it | MEDIUM | Same limits already apply to the upload endpoint; the failure becomes visible (`message:failed` + error log) instead of a phantom "sent". Manual test on the production CDN before merge. |
| Inline `video` by URL behaves differently from image | LOW | Documented as "same format"; covered by manual test. |
| `facebookElementSchema` does not declare the media-template element fields (`media_type`, `attachment_id`) the legacy converter sends | LOW | Structural typing accepts them today. Deliberately not modelled in this change — see §2.2 note. |
| `message_echoes` for inline attachments carry `payload.url` instead of a template | LOW | Echo dedup keys on `message_id` (`sendFlowStep` comment in `index.ts`); nothing reads the echo's template. |
| Buttons branch still broken on web for no-role users | KNOWN | Unchanged from today; §6.1. |

Complexity: **LOW** (≈ 45 lines of production code, ≈ 250 lines of tests).

## 6. Follow-ups (separate plans, not part of this change)

1. **Image/video with buttons** — choose between (a) generic template with
   `image_url` + buttons, which requires an optional `title`/caption on
   `sendImage` / `sendVideo` schemas (flow-config, editor, viewer, i18n) and
   only works for images; or (b) two messages (inline media, then a button
   template) which requires a text. Needs product input. Adding it is one more
   entry in `mediaConverters` plus a resolver rule.
2. **`send-file.ts`** — test the plain-attachment + `attachment_id` branch for
   `sendAudio` / `sendFile`; if broken, apply the same inline strategy.
3. **`integrations/instagram-facebook/send-media.ts`** — verify Instagram
   rendering of the media template; mirror v2 if needed.
4. **Quick-reply spread consolidation** — introduce
   `withQuickReplies(message, quickReplies)` in `send-quick-replies.ts` and
   migrate `send-gif.ts`, `send-file.ts`, `send-multiple-images.ts`,
   `send-media.ts`, `send-media-v2.ts` in one pure refactor, guarded by the
   existing quick-reply tests.

## 7. Open decisions for the owner

1. **Failure semantics** (§2.5): accept that a bad media URL on a no-button
   step now records `message:failed` instead of a phantom `message:sent`?
   (Recommended: yes.)
2. **File name**: `send-media-v2.ts` (covers image + video, mirrors the file it
   supersedes) rather than `send-image-v2.ts`. OK?
3. **Table vs. ternary**: Codex round 1 called the `mediaConverters` table
   over-engineered for two branches and suggested a direct
   `step.buttons.length > 0 ? convertFlowStepMedia(props) : convertInlineMedia(props)`.
   Kept the table because the owner's rules ask for object/enum-driven
   business logic and it is the extension point for §6.1. Confirm or switch.
4. **No feature flag**: rollback is reverting the two dispatcher hunks. If a
   runtime kill-switch is wanted, it would be an env var read once in
   `send-media-v2.ts` forcing `mediaTemplate`; say so and it is added.
