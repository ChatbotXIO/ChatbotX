import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { ButtonStepProps } from "../steps/button"
import { BUTTON_LABEL_MAX } from "../steps/button"
import { flowValidationCodes } from "../validation-codes"
import { TIKTOK_CARD_TITLE_MAX } from "./tiktok-text-rules"

/**
 * Message-body limit each channel's send API accepts, in characters.
 *
 * This is the real enforcement surface: `sendTextStepSchema` only caps at the
 * widest value here (`SEND_TEXT_MAX`), and `refineSendTextLengthForChannel`
 * narrows publish to the author's actual channel. The editor's counter reads
 * the same table, so the budget shown and the one publish enforces are one
 * number, not two that can drift.
 *
 * `omnichannel` deliberately keeps the conservative 1000 rather than the widest
 * value: such a flow may land on any channel, so its text has to fit the ones
 * it will realistically reach (instagram 1000, messenger 2000). It is NOT the
 * minimum of the table — `threads` is tighter still at 500 — because a flow may
 * never serve Threads and blocking publish would refuse a valid design; the
 * channel's own rule catches it when the node is bound to Threads. `webchat`,
 * `api` and `smtp` are ours to define and carry no platform cap, so they take
 * the ceiling.
 *
 * `whatsapp` is the plain-text limit (`messageLimits.text`), not the 1024 of an
 * interactive body: a button-less step is sent as a single `Text`, and once
 * buttons are attached `buildWhatsappButtonMessages` runs the body through
 * `splitText`, which continues it across messages rather than losing it. Neither
 * path rejects at 1024, so blocking publish there refused sends that work.
 */
const CHANNEL_TEXT_MAX: Record<ChannelType, number> = {
  api: 6000,
  instagram: 1000,
  messenger: 2000,
  omnichannel: 1000,
  smtp: 6000,
  telegram: 4096,
  threads: 500,
  tiktok: 6000,
  webchat: 6000,
  whatsapp: 4096,
  zalo: 2000,
}

/**
 * Widest message body any channel accepts — the cap `sendTextStepSchema`
 * carries, since the schema cannot know which channel a step runs on. Derived
 * from the table so a channel raised above it can never become unrepresentable.
 */
export const SEND_TEXT_MAX = Math.max(...Object.values(CHANNEL_TEXT_MAX))

export type SendTextLengthLimits = {
  /** Max characters the message body may carry on this channel. */
  text: number
  /** Max characters an attached button label may carry. */
  buttonLabel: number
  /** Max characters a quick reply label may carry. */
  quickReplyLabel: number
}

const resolveChannelKey = (channel: string | null | undefined): ChannelType => {
  const parsed = channelTypes.safeParse(channel)

  return parsed.success ? parsed.data : channelTypes.enum.omnichannel
}

/**
 * Character limits to show the author while they edit a sendText step, for
 * the channel the node is bound to.
 *
 * `hasButtons` and `hasQuickReplies` matter on TikTok only: once EITHER is
 * present the message is sent as a QA_BUTTON_CARD/QA_LINK_CARD `title`, which
 * TikTok cuts at `TIKTOK_CARD_TITLE_MAX`. Quick replies count because they live
 * on the node rather than the step, yet `convertFlowStepText` builds a template
 * from `step.buttons.length === 0 && quickReplies.length === 0` — a node whose
 * only buttons are quick replies still produces a card, and a counter reading
 * `hasButtons` alone would show the author the full budget for a 40-char field.
 *
 * Applied for the `tiktok` channel only, never for `omnichannel`, matching
 * `refineTiktokSendTextStep`: an omnichannel flow may never reach a TikTok
 * contact, so showing it a 40-char budget would be wrong.
 *
 * No channel's button or quick reply label limit is stricter than
 * `BUTTON_LABEL_MAX`, which `buttonStepSchema` already enforces everywhere,
 * so both label limits are that ceiling today. They stay separate fields so a
 * future stricter channel has a place to land.
 */
export const resolveSendTextLengthLimits = (props: {
  channel: string | null | undefined
  hasButtons?: boolean
  hasQuickReplies?: boolean
}): SendTextLengthLimits => {
  const channel = resolveChannelKey(props.channel)

  const isTiktokCard =
    channel === channelTypes.enum.tiktok &&
    (props.hasButtons === true || props.hasQuickReplies === true)

  return {
    text: isTiktokCard ? TIKTOK_CARD_TITLE_MAX : CHANNEL_TEXT_MAX[channel],
    buttonLabel: BUTTON_LABEL_MAX,
    quickReplyLabel: BUTTON_LABEL_MAX,
  }
}

/**
 * Counts characters the way a messaging platform does — by code point, so an
 * emoji built from a surrogate pair counts as one, not two. Mirrors how
 * `tiktok-text-rules` already measures a card title.
 */
export const countMessageCharacters = (
  value: string | null | undefined,
): number => Array.from(value ?? "").length

/**
 * Blocks publish (and worker import) for a sendText step whose message is
 * longer than the node's channel accepts — the send would be rejected or
 * truncated at runtime, where the author never sees it.
 *
 * Deliberately measures against the channel's own limit and ignores TikTok's
 * narrower card-title case, which `refineTiktokSendTextStep` already raises
 * with a message of its own; checking it here too would surface the same
 * problem twice on one step.
 *
 * Past `SEND_TEXT_MAX` it stays silent for the same reason: that ceiling is the
 * widest entry in the table, so a text over it is over every channel's limit
 * and `sendTextStepSchema`'s own cap — which raises this exact code — has
 * already fired at the same path. The field cap runs whether or not a channel
 * is known, so it is the one that gets to speak.
 */
export const refineSendTextLengthForChannel =
  (channel: ChannelType) =>
  (
    step: { text: string; buttons: ButtonStepProps[] },
    ctx: z.RefinementCtx,
  ): void => {
    const length = countMessageCharacters(step.text)

    if (length > SEND_TEXT_MAX) {
      return
    }

    if (length > CHANNEL_TEXT_MAX[channel]) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.sendTextTooLongForChannel,
        path: ["text"],
      })
    }
  }
