import { channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { ButtonStepProps } from "../steps/button"
import { flowValidationCodes } from "../validation-codes"

/**
 * TikTok's QA_BUTTON_CARD/QA_LINK_CARD send only accepts up to 40 chars in
 * the card `title` (the step's message text) — confirmed against production,
 * where TikTok silently rejected the whole send past that length.
 *
 * Shared with the TikTok integration on purpose: `integrations/tiktok` clamps
 * to this same limit instead of failing, so the flow editor reads it too, to
 * warn the author before their message is silently cut short.
 */
export const TIKTOK_CARD_TITLE_MAX = 40

/**
 * True once the message is sent as a card at all — `convertFlowStepText` in
 * `integrations/tiktok` switches from a plain TEXT to a TEMPLATE as soon as
 * `step.buttons.length === 0 && quickReplies.length === 0` stops holding, so a
 * node whose only buttons are quick replies builds the same card and hits the
 * same 40-char title.
 *
 * Quick replies live on the node, not the step, so a step-level `superRefine`
 * can never see them — `quickReplyCount` is threaded in by the caller that has
 * the node in scope (`refineStepsByChannel`) and defaults to 0 for the
 * step-only callers.
 */
const formsButtonCard = (props: {
  buttons: ButtonStepProps[] | null | undefined
  quickReplyCount?: number
}): boolean => (props.buttons?.length ?? 0) + (props.quickReplyCount ?? 0) > 0

/**
 * True once the message is sent as a card and its text is longer than TikTok's
 * card title allows. Channel-agnostic on purpose: the publish-time refinement
 * below already runs only under the `tiktok` key of a `ChannelValidatorMap`,
 * so it has no channel to check — only the UI notice (`isTiktokCardTitleTruncated`)
 * needs to gate on channel itself.
 */
const exceedsCardTitleMax = (props: {
  buttons: ButtonStepProps[] | null | undefined
  quickReplyCount?: number
  text: string | null | undefined
}): boolean =>
  formsButtonCard(props) &&
  Array.from(props.text ?? "").length > TIKTOK_CARD_TITLE_MAX

/**
 * Channels on which a sendText step can reach a TikTok contact, and so have
 * its message truncated once buttons are attached.
 *
 * `omnichannel` is here but is deliberately *not* under the `tiktok` key in
 * `sendTextValidator` — the flow may only ever serve channels where the full
 * text is safe, so blocking publish would refuse a valid design. Warning the
 * author is the part that is always right. Mirrors `WHATSAPP_REACHABLE_CHANNELS`
 * in `send-carousel/validator.ts` (apps/builder).
 */
const TIKTOK_REACHABLE_CHANNELS: ReadonlySet<string> = new Set([
  channelTypes.enum.tiktok,
  channelTypes.enum.omnichannel,
])

/**
 * True when this step's message text will be truncated by TikTok's card title
 * limit — sending as plain TEXT has no such limit, so a step with neither its
 * own buttons nor a node-level quick reply is never affected.
 */
export const isTiktokCardTitleTruncated = (props: {
  channel: string | null | undefined
  buttons: ButtonStepProps[] | null | undefined
  quickReplyCount?: number
  text: string | null | undefined
}): boolean =>
  TIKTOK_REACHABLE_CHANNELS.has(props.channel ?? "") &&
  exceedsCardTitleMax(props)

/**
 * Blocks publish (and worker import) for a `sendText` step on a TikTok node
 * once its message would be truncated — wired in via `sendTextValidator`
 * under the `tiktok` key, so `omnichannel` (which may never reach a TikTok
 * contact) is never blocked, only warned by the editor's live notice.
 */
export const refineTiktokSendTextStep = (
  step: { text: string; buttons: ButtonStepProps[] },
  ctx: z.RefinementCtx,
): void => {
  if (exceedsCardTitleMax(step)) {
    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.tiktokCardTitleTooLong,
      path: ["text"],
    })
  }
}

/**
 * Node-level counterpart of {@link refineTiktokSendTextStep}: true when a
 * node's quick replies are what turn this step into a card, and its text is
 * too long for the resulting title.
 *
 * A predicate rather than a refinement because the caller is
 * `refineStepsByChannel`, which parses the step through a `ChannelValidatorMap`
 * and then re-anchors every issue onto the node's path — raising the issue
 * there keeps that path built in exactly one place.
 *
 * Returns false once the step carries buttons of its own: that case is already
 * caught by `refineTiktokSendTextStep` under the `tiktok` key, and the author
 * must not see the identical code twice on one step.
 */
export const isTiktokQuickReplyCardTitleTooLong = (props: {
  step: { text: string; buttons: ButtonStepProps[] }
  quickReplyCount: number
}): boolean =>
  props.step.buttons.length === 0 &&
  exceedsCardTitleMax({
    buttons: props.step.buttons,
    quickReplyCount: props.quickReplyCount,
    text: props.step.text,
  })
