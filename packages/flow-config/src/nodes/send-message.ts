import { z } from "zod"
import { actionSteps } from "../shared"
import { buttonStepSchema } from "../steps/button"
import {
  chooseChannelStepDefaultFn,
  chooseChannelStepSchema,
} from "../steps/choose-channel"
import { getUserDataStepSchema } from "../steps/get-user-data"
import { sendAudioStepSchema } from "../steps/send-audio"
import { sendCarouselStepSchema } from "../steps/send-carousel"
import { sendFileStepSchema } from "../steps/send-file"
import { sendGifStepSchema } from "../steps/send-gif"
import { sendImageStepSchema } from "../steps/send-image"
import { sendMessengerTemplateMessageStepSchema } from "../steps/send-messenger-message-template"
import { MAX_QUICK_REPLIES } from "../steps/send-quick-reply"
import { sendTextStepSchema } from "../steps/send-text"
import { sendVideoStepSchema } from "../steps/send-video"
import { sendWaTemplateMessageStepSchema } from "../steps/send-wa-message-template"
import { typingStepSchema } from "../steps/typing"
import { whatsappFlowStepSchema } from "../steps/whatsapp-flow"
import { whatsappOptionListStepSchema } from "../steps/whatsapp-option-list"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const sendMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.sendMessage),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: chooseChannelStepSchema,
      steps: z.array(
        z.discriminatedUnion("stepType", [
          sendAudioStepSchema,
          sendFileStepSchema,
          sendImageStepSchema,
          sendTextStepSchema,
          sendVideoStepSchema,
          // sendCardStepSchema,
          sendCarouselStepSchema,
          getUserDataStepSchema,
          sendGifStepSchema,
          typingStepSchema,
          sendWaTemplateMessageStepSchema,
          sendMessengerTemplateMessageStepSchema,
          whatsappOptionListStepSchema,
          whatsappFlowStepSchema,
          ...actionSteps,
        ]),
      ),
      quickReplies: z.array(buttonStepSchema).max(MAX_QUICK_REPLIES),
    }),
  }),
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>

export const sendMessageNodeDefaultFn = (
  props: DefaultNodeProps,
): SendMessageNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.sendMessage,
  ...props.nodeProps,
  data: {
    name: "Send Message",
    isStartNode: false,
    ...props.dataProps,
    details: {
      beforeStep: chooseChannelStepDefaultFn(),
      steps: [],
      quickReplies: [],
      ...props.detailProps,
    },
  },
})

export const BROADCAST_PAYLOAD_TYPE = "broadcast"
export const SEQUENCE_SCHEDULE_PAYLOAD_TYPE = "sequenceSchedule"
export const UPDATE_STATUS_PAYLOAD_TYPE = "updateStatus"
export const FLOW_NODE_PAYLOAD_TYPE = "flowNode"

export const baseMetadataPayload = z.object({
  stepId: z.string().optional(),
  contactInboxId: z.string().optional(),
})
export type BaseMetadataPayload = z.infer<typeof baseMetadataPayload>

export const broadcastMetadataPayload = baseMetadataPayload.extend({
  type: z.literal(BROADCAST_PAYLOAD_TYPE),
  broadcastId: z.string(),
  contactInboxId: z.string(),
})

export const sequenceScheduleMetadataPayload = baseMetadataPayload.extend({
  type: z.literal(SEQUENCE_SCHEDULE_PAYLOAD_TYPE),
  sequenceStepId: z.string(),
  sequenceId: z.string(),
  dispatchId: z.string(),
  contactInboxId: z.string(),
})

export const updateStatusPayload = baseMetadataPayload.extend({
  type: z.literal(UPDATE_STATUS_PAYLOAD_TYPE),
})

export type BroadcastMetadataPayload = z.infer<typeof broadcastMetadataPayload>

export type SequenceScheduleMetadataPayload = z.infer<
  typeof sequenceScheduleMetadataPayload
>

export const metadataSchema = z.discriminatedUnion("type", [
  broadcastMetadataPayload,
  sequenceScheduleMetadataPayload,
  updateStatusPayload,
])

export type MetadataPayload = z.infer<typeof metadataSchema>
