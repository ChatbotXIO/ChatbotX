import {
  CHANNEL_FLOW_POLICIES,
  channelDeliverableStepTypes,
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
import {
  handledFlowStepTypes as whatsappHandledFlowStepTypes,
  handledOutgoingContentEntities as whatsappHandledOutgoingContentEntities,
} from "../../../integrations/whatsapp/src/handlers/message/outgoing-message"
import { handledFlowStepTypes as zaloHandledFlowStepTypes } from "../../../integrations/zalo/src/handlers/message/outgoing-message"

const MESSAGE_STEP_TYPES = [
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendViewCatalog,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.whatsappOptionList,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappLocation,
  stepTypes.enum.whatsappFlow,
  stepTypes.enum.sendProducts,
  stepTypes.enum.sendCollection,
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

/**
 * Entities a channel's `sendMessage` renders from `contentAttributes.type`. Keyed
 * by channel; a channel with no entry renders none.
 */
const HANDLED_OUTGOING_CONTENT_ENTITIES: Partial<
  Record<ChannelType, readonly string[]>
> = {
  whatsapp: whatsappHandledOutgoingContentEntities,
}

describe("channel flow policy runtime contract", () => {
  test("lists every deliverable step type, so a new one cannot go unchecked", () => {
    expect(new Set(MESSAGE_STEP_TYPES)).toEqual(
      new Set(channelDeliverableStepTypes),
    )
  })

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

  test.each(
    (Object.keys(CHANNEL_FLOW_POLICIES) as ChannelType[]).map((channel) => ({
      channel,
    })),
  )("$channel renders a product message row if and only if its policy declares product messages", ({
    channel,
  }) => {
    const declaresProductMessages = Boolean(
      CHANNEL_FLOW_POLICIES[channel].productMessages,
    )
    const rendersProductMessageRow = (
      HANDLED_OUTGOING_CONTENT_ENTITIES[channel] ?? []
    ).includes("product_message")

    expect(rendersProductMessageRow).toBe(declaresProductMessages)
  })
})
