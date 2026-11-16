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
  buttonContainers,
  CHANNEL_FLOW_POLICIES,
  CHANNEL_POLICY_VERSION,
  getButtonCountLimit,
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
  quickRepliesShareButtonSlots: boolean,
  limit: number,
): ButtonCount => {
  const buttons = Array.isArray(step.buttons) ? step.buttons : []
  const isTextStep = step.stepType === stepTypes.enum.sendText
  const countedQuickReplies =
    isTextStep && quickRepliesShareButtonSlots ? quickReplyCount : 0
  const total = buttons.length + countedQuickReplies

  return {
    buttons,
    quickRepliesCauseOverflow:
      countedQuickReplies > 0 && total > limit && buttons.length <= limit,
    total,
  }
}

/**
 * Rejects publish, restore, and import graphs whose channel cannot deliver a
 * configured message step.
 */
export const refineStepsByChannel = (
  nodes: FlowVersionSchema[],
  ctx: z.RefinementCtx,
): void => {
  nodes.forEach((node, nodeIndex) => {
    if (node.type !== nodeTypeSchema.enum.sendMessage) {
      return
    }

    const channel = getSendMessageChannel(node)

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
        addStepIssue(
          `The ${channel} channel does not support ${step.stepType}.`,
          [],
          {
            block: step.stepType,
            channel,
            code: flowValidationCodes.unsupportedBlock,
            policyVersion: CHANNEL_POLICY_VERSION,
          },
        )
        return
      }

      const maxButtonCountIssue = (actual: number, allowed: number) => {
        const capability = {
          actual,
          allowed,
          block: step.stepType,
          channel,
          code: flowValidationCodes.constraintExceeded,
          constraintId: "maxButtonCount",
          policyVersion: CHANNEL_POLICY_VERSION,
          unit: "buttons",
        }
        return {
          capability,
          message: `${step.stepType} exceeds the ${channel} maximum of ${capability.allowed} ${capability.unit}.`,
        }
      }

      // A card's buttons — a sendCard step, or each card of a sendCarousel —
      // have the policy's card limit, never the step one.
      if (step.stepType === stepTypes.enum.sendCarousel) {
        const allowed = getButtonCountLimit(policy, buttonContainers.card)
        step.cards.forEach((card, cardIndex) => {
          if (card.buttons.length > allowed) {
            const issue = maxButtonCountIssue(card.buttons.length, allowed)
            addStepIssue(
              issue.message,
              ["cards", cardIndex, "buttons"],
              issue.capability,
            )
          }
        })
      }

      const buttonLimit = getButtonCountLimit(
        policy,
        step.stepType === stepTypes.enum.sendCard
          ? buttonContainers.card
          : buttonContainers.step,
      )
      const buttonCount = checkButtonCount(
        step,
        quickReplyCount,
        policy.quickRepliesShareButtonSlots,
        buttonLimit,
      )
      if (buttonCount.total > buttonLimit) {
        const { capability, message } = maxButtonCountIssue(
          buttonCount.total,
          buttonLimit,
        )

        if (
          buttonCount.quickRepliesCauseOverflow &&
          !quickReplyOverflowReported
        ) {
          quickReplyOverflowReported = true
          ctx.addIssue({
            code: "custom",
            message,
            params: { capability },
            path: [nodeIndex, "data", "details", "quickReplies"],
          })
        } else if (!buttonCount.quickRepliesCauseOverflow) {
          addStepIssue(message, ["buttons"], capability)
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
