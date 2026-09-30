import { channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { FlowAuthoringError } from "../authoring/errors"
import { nodeTypeSchema } from "../nodes/base"
import type { FlowVersionSchema } from "../nodes/index"
import { getSendMessageChannel } from "../nodes/send-message"
import { type StepType, stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"
import { resolveStepValidator } from "./channel-validator"
import {
  CHANNEL_FLOW_POLICIES,
  CHANNEL_POLICY_VERSION,
  stepSupport,
} from "./policies"
import { isTiktokQuickReplyCardTitleTooLong } from "./tiktok-text-rules"
import { channelAwareStepValidators } from "./validators"

type ButtonCount = {
  buttons: unknown[]
  quickRepliesCauseOverflow: boolean
  total: number
}

const checkButtonCount = (
  step: { buttons?: unknown; stepType: StepType },
  quickReplyCount: number,
  limit: number,
): ButtonCount => {
  const buttons = Array.isArray(step.buttons) ? step.buttons : []
  const isTextStep = step.stepType === stepTypes.enum.sendText
  const total = buttons.length + (isTextStep ? quickReplyCount : 0)

  return {
    buttons,
    quickRepliesCauseOverflow:
      isTextStep && total > limit && buttons.length <= limit,
    total,
  }
}

export const refineStepsByChannel = (
  nodes: FlowVersionSchema[],
  ctx: z.RefinementCtx,
): void => {
  nodes.forEach((node, nodeIndex) => {
    if (node.type !== nodeTypeSchema.enum.sendMessage) {
      return
    }

    const channel = getSendMessageChannel(node)
    if (!channel) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.unsupportedChannel,
        path: [nodeIndex, "data", "details", "beforeStep", "channel"],
      })
      return
    }

    const policy = CHANNEL_FLOW_POLICIES[channel]
    const quickReplyCount = node.data.details.quickReplies.length
    let quickReplyOverflowReported = false

    node.data.details.steps.forEach((step, stepIndex) => {
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

      if (policy.steps[step.stepType] === stepSupport.unsupported) {
        addStepIssue(flowValidationCodes.unsupportedBlock, [], {
          block: step.stepType,
          channel,
          code: flowValidationCodes.unsupportedBlock,
          policyVersion: CHANNEL_POLICY_VERSION,
        })
        return
      }

      const buttonCount = checkButtonCount(
        step,
        quickReplyCount,
        policy.limits.buttonCount,
      )
      if (buttonCount.total > policy.limits.buttonCount) {
        const capability = {
          actual: buttonCount.total,
          allowed: policy.limits.buttonCount,
          block: step.stepType,
          channel,
          code: flowValidationCodes.constraintExceeded,
          constraintId: "maxButtonCount",
          policyVersion: CHANNEL_POLICY_VERSION,
          unit: "buttons",
        }

        if (
          buttonCount.quickRepliesCauseOverflow &&
          !quickReplyOverflowReported
        ) {
          quickReplyOverflowReported = true
          ctx.addIssue({
            code: "custom",
            message: flowValidationCodes.constraintExceeded,
            params: { capability },
            path: [nodeIndex, "data", "details", "quickReplies"],
          })
        } else if (!buttonCount.quickRepliesCauseOverflow) {
          addStepIssue(
            flowValidationCodes.constraintExceeded,
            ["buttons"],
            capability,
          )
        }
      }

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
