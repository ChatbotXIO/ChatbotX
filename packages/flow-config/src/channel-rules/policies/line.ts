import { buttonStyles, buttonTypes } from "../../steps/button"
import { stepTypes } from "../../steps/step-action"
import { type ButtonStyleSupport, defineChannelFlowPolicy } from "./define"

/**
 * LINE sends every button-bearing message as a Flex Message, whose button
 * component has these three styles; LINE's own default is `link`.
 */
export const LINE_BUTTON_STYLES = {
  options: buttonStyles.options,
  default: buttonStyles.enum.link,
} as const satisfies ButtonStyleSupport

// LINE text messages are capped at 5,000 characters. Buttons go out as Flex
// Message buttons (integrations/line `flex.ts`), which LINE does not count —
// only the 30 KB bubble size is capped — so 5 per text step, media step, card
// and carousel card is the product's choice, not a LINE limit.
export const lineFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 5,
    cardButtonCount: 5,
    buttonLabel: 20,
    text: 5000,
  },
  nativeButtonTypes: [buttonTypes.enum.callPhoneNumber],
  buttonStyles: LINE_BUTTON_STYLES,
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendVideo,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendAudio,
    stepTypes.enum.sendFile,
    stepTypes.enum.sendGif,
    stepTypes.enum.sendQuickReply,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendCard,
  ],
})
