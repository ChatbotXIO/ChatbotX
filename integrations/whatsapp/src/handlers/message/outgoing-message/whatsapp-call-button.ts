import {
  WHATSAPP_CALL_BUTTON_BODY_MAX,
  WHATSAPP_CALL_BUTTON_LABEL_MAX,
  type WhatsappCallButtonStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  InteractiveVoiceCallMessage,
  WhatsappAuthValue,
} from "../../../schema"

/**
 * Converts the "Call on WhatsApp" flow step into Meta's `voice_call`
 * interactive message. Requires calling to be enabled on the business phone
 * number (Settings → WhatsApp → Calls); Meta rejects the send otherwise.
 */
export function* convertFlowStepWhatsappCallButton(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      WhatsappCallButtonStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<InteractiveVoiceCallMessage> {
  const {
    data: { step },
  } = props

  const text = step.text.trim().slice(0, WHATSAPP_CALL_BUTTON_BODY_MAX)
  const displayText = step.buttonLabel
    .trim()
    .slice(0, WHATSAPP_CALL_BUTTON_LABEL_MAX)

  if (!(text && displayText)) {
    return
  }

  yield {
    _type: "interactive_voice_call",
    type: "interactive",
    interactive: {
      type: "voice_call",
      body: { text },
      action: {
        name: "voice_call",
        parameters: { display_text: displayText },
      },
    },
  }
}
