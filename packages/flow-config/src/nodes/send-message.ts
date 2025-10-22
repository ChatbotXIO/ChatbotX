import { z } from "zod"
import { actionSteps } from "../shared"
import {
  chooseChannelStepDefaultFn,
  chooseChannelStepSchema,
} from "../steps/choose-channel"
import { sendAudioStepSchema } from "../steps/send-audio"
import { sendCardStepSchema } from "../steps/send-card"
import { sendCarouselStepSchema } from "../steps/send-carousel"
import { sendFileStepSchema } from "../steps/send-file"
import { sendGifStepSchema } from "../steps/send-gif"
import { sendImageStepSchema } from "../steps/send-image"
import { sendTextStepSchema } from "../steps/send-text"
import { sendVideoStepSchema } from "../steps/send-video"
import { waitUserReplyStepSchema } from "../steps/wait-user-reply"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodeFnProps,
  NodeType,
} from "./base"

export const sendMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.sendMessage),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: chooseChannelStepSchema,
    afterStep: z.null(),
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
        waitUserReplyStepSchema,
        sendGifStepSchema,
        ...actionSteps,
      ]),
    ),
  }),
})
export type SendMessageNodeSchema = typeof sendMessageNodeSchema
export type SendMessageNodeProps = z.infer<typeof sendMessageNodeSchema>

export const sendMessageNodeDefaultFn = (
  props: NodeFnProps<SendMessageNodeProps>,
): SendMessageNodeProps =>
  baseNodeDefaultFn<SendMessageNodeProps>({
    ...props,
    type: NodeType.sendMessage,
    beforeStep: chooseChannelStepDefaultFn(),
  })
