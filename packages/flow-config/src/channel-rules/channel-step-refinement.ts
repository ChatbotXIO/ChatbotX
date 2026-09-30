import { channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { FlowAuthoringError } from "../authoring/errors"
import { nodeTypeSchema } from "../nodes/base"
import type { FlowVersionSchema } from "../nodes/index"
import {
  getSendMessageChannel,
  type SendMessageNodeSchema,
} from "../nodes/send-message"
import { stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"
import { resolveStepValidator } from "./channel-validator"
import { countMessageCharacters } from "./send-text-length-rules"
import { getChannelStepPolicy, isStepUnsupported } from "./step-support"
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

    const channel = getSendMessageChannel(node as SendMessageNodeSchema)
    const quickReplyCount = node.data.details.quickReplies.length
    if (!channel) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.unsupportedChannel,
        path: [nodeIndex, "data", "details", "beforeStep", "channel"],
      })
      return
    }

    const policy = getChannelStepPolicy(channel)

    node.data.details.steps.forEach((step, stepIndex) => {
      // Re-anchor onto the node path so the message resolver still finds the
      // validation code, and the issue points at the offending step.
      const addStepIssue = (
        message: string,
        path: PropertyKey[],
        capability?: FlowAuthoringError["capability"],
      ): void => {
        ctx.addIssue({
          code: "custom",
          message,
          path: [nodeIndex, "data", "details", "steps", stepIndex, ...path],
          params: capability ? { capability } : undefined,
        })
      }

      if (isStepUnsupported({ channel, stepType: step.stepType })) {
        addStepIssue(flowValidationCodes.unsupportedBlock, [], {
          alternatives: [],
          block: step.stepType,
          channel,
          policyVersion: policy?.policyVersion ?? 1,
        })
        return
      }

      const constraints = policy?.constraints
      const buttons =
        "buttons" in step && Array.isArray(step.buttons) ? step.buttons : []

      const buttonCount =
        step.stepType === stepTypes.enum.sendText
          ? buttons.length + quickReplyCount
          : buttons.length
      const exceedsButtonLimit =
        constraints?.maxButtonCount !== undefined &&
        buttonCount > constraints.maxButtonCount
      const quickRepliesCauseOverflow =
        exceedsButtonLimit &&
        step.stepType === stepTypes.enum.sendText &&
        buttons.length <=
          (constraints?.maxButtonCount ?? Number.POSITIVE_INFINITY)
      const countCapability = {
        actual: buttonCount,
        allowed: constraints?.maxButtonCount,
        alternatives: [],
        block: step.stepType,
        channel,
        constraintId: "maxButtonCount",
        policyVersion: policy?.policyVersion ?? 1,
        unit: "buttons",
      }

      if (quickRepliesCauseOverflow) {
        ctx.addIssue({
          code: "custom",
          message: flowValidationCodes.constraintExceeded,
          params: { capability: countCapability },
          path: [nodeIndex, "data", "details", "quickReplies"],
        })
      } else if (exceedsButtonLimit) {
        addStepIssue(
          flowValidationCodes.constraintExceeded,
          ["buttons"],
          countCapability,
        )
      }

      if (constraints?.maxButtonLabelLength !== undefined) {
        for (const [buttonIndex, button] of buttons.entries()) {
          if (
            typeof button === "object" &&
            button !== null &&
            "label" in button &&
            typeof button.label === "string" &&
            countMessageCharacters(button.label) >
              constraints.maxButtonLabelLength
          ) {
            addStepIssue(
              flowValidationCodes.constraintExceeded,
              ["buttons", buttonIndex, "label"],
              {
                actual: countMessageCharacters(button.label),
                allowed: constraints.maxButtonLabelLength,
                alternatives: [],
                block: step.stepType,
                channel,
                constraintId: "maxButtonLabelLength",
                policyVersion: policy?.policyVersion ?? 1,
                unit: "characters",
              },
            )
          }
        }
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
