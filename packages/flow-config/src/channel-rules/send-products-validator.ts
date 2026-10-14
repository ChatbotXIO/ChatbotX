import { channelTypes } from "@chatbotx.io/utils/channel"
import {
  refineSendProductsStructure,
  sendProductsStepSchema,
} from "../steps/send-products"
import type { ChannelValidatorMap } from "./channel-validator"
import { CHANNEL_FLOW_POLICIES } from "./policies"
import { refineProductMessage } from "./product-message-rules"

/**
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 *
 * Every channel whose policy declares `productMessages` gets its own override
 * generated from that table; adding a channel is adding data to its policy.
 */
const structuralSchema = sendProductsStepSchema.superRefine(
  refineSendProductsStructure,
)

const channelOverrides = Object.fromEntries(
  Object.entries(CHANNEL_FLOW_POLICIES).flatMap(([channel, policy]) =>
    policy.productMessages
      ? [
          [
            channel,
            structuralSchema.superRefine(
              refineProductMessage(policy.productMessages),
            ),
          ],
        ]
      : [],
  ),
)

export const sendProductsValidator = {
  ...channelOverrides,
  [channelTypes.enum.omnichannel]: structuralSchema,
} satisfies ChannelValidatorMap
