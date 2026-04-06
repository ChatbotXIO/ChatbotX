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

export const shareMetadataPayload = z.object({
  contactInboxId: z.string(),
})

export const broadcastMetadataPayload = shareMetadataPayload.extend({
  type: z.literal("broadcast"),
  broadcastId: z.string(),
})

export const sequenceScheduleMetadataPayload = shareMetadataPayload.extend({
  type: z.literal("sequenceSchedule"),
  stepId: z.string(),
  sequenceId: z.string(),
  dispatchId: z.string(),
})

export type SharedMetadataPayload = z.infer<typeof shareMetadataPayload>

export type BroadcastMetadataPayload = z.infer<typeof broadcastMetadataPayload>

export type SequenceScheduleMetadataPayload = z.infer<
  typeof sequenceScheduleMetadataPayload
>

export const metadataSchema = z.discriminatedUnion("type", [
  broadcastMetadataPayload,
  sequenceScheduleMetadataPayload,
])

export type MetadataPayload = z.infer<typeof metadataSchema>
