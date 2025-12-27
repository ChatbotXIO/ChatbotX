import { z } from "zod"
import { actionSteps } from "../shared"
import { buttonStepSchema } from "../steps/button"
import {
  chooseChannelStepDefaultFn,
  chooseChannelStepSchema,
} from "../steps/choose-channel"
import { getUserInputStepSchema } from "../steps/get-user-input"
import { sendAudioStepSchema } from "../steps/send-audio"
import { sendCardStepSchema } from "../steps/send-card"
import { sendCarouselStepSchema } from "../steps/send-carousel"
import { sendFileStepSchema } from "../steps/send-file"
import { sendGifStepSchema } from "../steps/send-gif"
import { sendImageStepSchema } from "../steps/send-image"
import { sendTextStepSchema } from "../steps/send-text"
import { sendVideoStepSchema } from "../steps/send-video"
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
        z.union([
          sendAudioStepSchema,
          sendFileStepSchema,
          sendFileStepSchema,
          sendImageStepSchema,
          sendTextStepSchema,
          sendVideoStepSchema,
          sendCardStepSchema,
          sendCarouselStepSchema,
          getUserInputStepSchema,
          sendGifStepSchema,
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
