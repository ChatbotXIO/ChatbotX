import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy, whatsappOnlyStepTypes } from "./define"
// TikTok text payloads allow 6,000 characters; button cards use the tighter title cap below.

/**
 * TikTok QA button-card titles are limited to 40 characters.
 *
 * Kept next to TikTok's policy so validation and outbound conversion share one
 * provider constraint.
 */
export const TIKTOK_CARD_TITLE_MAX = 40

export const tiktokFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    cardTitle: TIKTOK_CARD_TITLE_MAX,
    text: 6000,
  },
  quickRepliesShareButtonSlots: true,
  // TikTok's runtime switch implements only text, single-image, and
  // multiple-image flow steps.
  noButtons: [stepTypes.enum.sendImage],
  unsupported: [
    stepTypes.enum.sendCard,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
