import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import { countMessageCharacters } from "./characters"
import { CHANNEL_FLOW_POLICIES } from "./policies"

/**
 * The widest caption any channel accepts. The step schema has no channel to
 * check, so it caps here; `refineMediaCaptionForChannel` applies the author's
 * actual limit per channel.
 */
export const MEDIA_CAPTION_MAX = Math.max(
  ...Object.values(CHANNEL_FLOW_POLICIES).flatMap((policy) =>
    policy.limits.mediaCaption === undefined
      ? []
      : [policy.limits.mediaCaption],
  ),
)

/** The channel's caption limit, or `undefined` when it sends no caption. */
export const resolveMediaCaptionLimit = (
  channel: string | null | undefined,
): number | undefined => {
  const parsed = channelTypes.safeParse(channel)

  return parsed.success
    ? CHANNEL_FLOW_POLICIES[parsed.data].limits.mediaCaption
    : undefined
}

export const refineMediaCaptionForChannel =
  (channel: ChannelType) =>
  (step: { caption?: string }, ctx: z.RefinementCtx): void => {
    if (!step.caption) {
      return
    }

    const limit = resolveMediaCaptionLimit(channel)

    if (limit === undefined) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaCaptionUnsupported,
        path: ["caption"],
      })
      return
    }

    if (countMessageCharacters(step.caption) > limit) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaCaptionTooLong,
        path: ["caption"],
      })
    }
  }
