import { channelTypes } from "@chatbotx.io/database/partials"
import {
  type ButtonStepProps,
  readStrandedCarouselLinkButton,
  refineWhatsappCarouselStep,
  sendCarouselStepSchema,
} from "@chatbotx.io/flow-config"
import type { ChannelValidatorMap } from "../channel-validator"

/**
 * Kept apart from `index.ts` so the publish schema can import it without
 * pulling this step's editor/viewer — and with them all of React — into the
 * `"use server"` module graph that `publishFlowAction` sits in.
 */
export const sendCarouselValidator = {
  [channelTypes.enum.omnichannel]: sendCarouselStepSchema,
  [channelTypes.enum.whatsapp]: sendCarouselStepSchema.superRefine(
    refineWhatsappCarouselStep,
  ),
} satisfies ChannelValidatorMap

/**
 * Channels on which a carousel card can reach WhatsApp, and so lose a link
 * button that shares its card with other buttons.
 *
 * `omnichannel` is here but is deliberately *not* in the validator map above: the
 * flow may only ever serve channels where a mixed card is legal (Messenger sends
 * each button independently), so refusing to publish it would block a valid
 * design. Warning the author is the part that is always right.
 */
const WHATSAPP_REACHABLE_CHANNELS: ReadonlySet<string> = new Set([
  channelTypes.enum.whatsapp,
  channelTypes.enum.omnichannel,
])

/**
 * The link button this card would lose on WhatsApp, for the editor to flag.
 *
 * Reads the same classifier as the publish rule and the WhatsApp sender
 * (`readStrandedCarouselLinkButton`), so the notice cannot claim a loss the
 * sender would not actually cause.
 */
export const readDroppedCarouselCardLink = (props: {
  channel: string | null | undefined
  buttons: ButtonStepProps[] | null | undefined
}): ButtonStepProps | undefined =>
  WHATSAPP_REACHABLE_CHANNELS.has(props.channel ?? "")
    ? readStrandedCarouselLinkButton(props.buttons ?? [])
    : undefined
