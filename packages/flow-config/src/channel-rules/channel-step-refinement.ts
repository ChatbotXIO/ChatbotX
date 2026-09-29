import { channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import { nodeTypeSchema } from "../nodes/base"
import type { FlowVersionSchema } from "../nodes/index"
import { stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"
import { resolveStepValidator } from "./channel-validator"
import { isTiktokQuickReplyCardTitleTooLong } from "./tiktok-text-rules"
import { channelAwareStepValidators } from "./validators"

/**
 * Validates every step against the channel its node sends on.
 *
 * The channel lives on the node, not the step — a `sendMessage` node carries a
 * `chooseChannel` beforeStep — so a per-step rule can only be resolved from here,
 * where both are in scope.
 *
 * Runs on publish (builder) and import validation (worker) only. Draft autosave
 * uses `z.array(z.any())`, so a half-built step is still saved and the author is
 * not interrupted mid-edit.
 */
export const refineStepsByChannel = (
  nodes: FlowVersionSchema[],
  ctx: z.RefinementCtx,
): void => {
  nodes.forEach((node, nodeIndex) => {
    if (node.type !== nodeTypeSchema.enum.sendMessage) {
      return
    }

    const { channel } = node.data.details.beforeStep
    const quickReplyCount = node.data.details.quickReplies.length

    node.data.details.steps.forEach((step, stepIndex) => {
      // Re-anchor onto the node path so the message resolver still finds the
      // validation code, and the issue points at the offending step.
      const addStepIssue = (message: string, path: PropertyKey[]): void => {
        ctx.addIssue({
          code: "custom",
          message,
          path: [nodeIndex, "data", "details", "steps", stepIndex, ...path],
        })
      }

      // Node-level rule: quick replies are not part of the step, so the
      // per-step validator below cannot see that they turn this message into a
      // TikTok card with a 40-char title.
      if (
        channel === channelTypes.enum.tiktok &&
        step.stepType === stepTypes.enum.sendText &&
        isTiktokQuickReplyCardTitleTooLong({ step, quickReplyCount })
      ) {
        addStepIssue(flowValidationCodes.tiktokCardTitleTooLong, ["text"])
      }

      const validator = channelAwareStepValidators[step.stepType]
      if (!validator) {
        return
      }

      const result = resolveStepValidator(validator, channel).safeParse(step)
      if (result.success) {
        return
      }

      for (const issue of result.error.issues) {
        addStepIssue(issue.message, issue.path)
      }
    })
  })
}
