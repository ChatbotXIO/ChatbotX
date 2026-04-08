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
import { sendTextStepSchema } from "../steps/send-text"
import { sendVideoStepSchema } from "../steps/send-video"
import { sendWaTemplateMessageStepSchema } from "../steps/send-wa-message-template"
import { typingStepSchema } from "../steps/typing"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  NodeType,
} from "./base"

export const sendMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.sendMessage),
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
          ...actionSteps,
        ]),
      ),
      quickReplies: z.array(buttonStepSchema),
    }),
  }),
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>

export const sendMessageNodeDefaultFn = (
  props: DefaultNodeProps,
): SendMessageNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.sendMessage,
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

export const broadcastMetadataPayload = z.object({
  type: z.literal(BROADCAST_PAYLOAD_TYPE),
  broadcastId: z.string(),
  contactInboxId: z.string(),
})

export const sequenceScheduleMetadataPayload = z.object({
  type: z.literal(SEQUENCE_SCHEDULE_PAYLOAD_TYPE),
  stepId: z.string(),
  sequenceId: z.string(),
  dispatchId: z.string(),
  contactInboxId: z.string(),
})

export const updateStatusPayload = z.object({
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
