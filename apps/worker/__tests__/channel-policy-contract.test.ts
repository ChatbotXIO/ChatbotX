import {
  CHANNEL_FLOW_POLICIES,
  type StepType,
  stepSupport,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { handledFlowStepTypes as apiHandledFlowStepTypes } from "../../../integrations/api/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as instagramHandledFlowStepTypes } from "../../../integrations/instagram/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as instagramFacebookHandledFlowStepTypes } from "../../../integrations/instagram-facebook/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as messengerHandledFlowStepTypes } from "../../../integrations/messenger/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as telegramHandledFlowStepTypes } from "../../../integrations/telegram/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as tiktokHandledFlowStepTypes } from "../../../integrations/tiktok/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as whatsappHandledFlowStepTypes } from "../../../integrations/whatsapp/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as zaloHandledFlowStepTypes } from "../../../integrations/zalo/src/handlers/message/outgoing-message"

const MESSAGE_STEP_TYPES = [
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.whatsappOptionList,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappFlow,
] as const satisfies readonly StepType[]

const HANDLED_STEP_TYPES: ReadonlyArray<{
  channel: ChannelType
  steps: readonly StepType[]
}> = [
  { channel: "instagram", steps: instagramHandledFlowStepTypes },
  { channel: "api", steps: apiHandledFlowStepTypes },
  { channel: "instagram", steps: instagramFacebookHandledFlowStepTypes },
  { channel: "messenger", steps: messengerHandledFlowStepTypes },
  { channel: "telegram", steps: telegramHandledFlowStepTypes },
  { channel: "smtp", steps: [] },
  { channel: "threads", steps: [] },
  { channel: "tiktok", steps: tiktokHandledFlowStepTypes },
  { channel: "whatsapp", steps: whatsappHandledFlowStepTypes },
  { channel: "zalo", steps: zaloHandledFlowStepTypes },
]

describe("channel flow policy runtime contract", () => {
  test.each(
    HANDLED_STEP_TYPES,
  )("$channel handles every message step its policy permits", ({
    channel,
    steps,
  }) => {
    const permittedSteps = MESSAGE_STEP_TYPES.filter(
      (stepType) =>
        CHANNEL_FLOW_POLICIES[channel].steps[stepType] !==
        stepSupport.unsupported,
    )

    expect(steps).toEqual(expect.arrayContaining(permittedSteps))
    expect(permittedSteps).toEqual(expect.arrayContaining(steps))
  })
})
