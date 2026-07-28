import { couponService } from "@chatbotx.io/business"
import type {
  MarkCouponUsedStepSchema,
  SetUpCouponStepSchema,
} from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function setUpCoupon(
  props: ExecuteStepProps<SetUpCouponStepSchema>,
): Promise<ExecuteStepResult> {
  try {
    const result = await couponService.issueCoupon({
      workspaceId: props.conversation.workspaceId,
      topicId: props.step.topicId,
      contactId: props.conversation.contactId,
    })
    if (!result.ok) {
      logger.warn(
        {
          workspaceId: props.conversation.workspaceId,
          topicId: props.step.topicId,
          contactId: props.conversation.contactId,
          conversationId: props.conversation.id,
          action: props.step.stepType,
          reason: result.reason,
        },
        "Coupon issue skipped",
      )
    }
    return { status: "success", result }
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        workspaceId: props.conversation.workspaceId,
        topicId: props.step.topicId,
        contactId: props.conversation.contactId,
        conversationId: props.conversation.id,
        action: props.step.stepType,
      },
      "Coupon issue failed",
    )
    return { status: "error", result: null }
  }
}

export async function markCouponUsed(
  props: ExecuteStepProps<MarkCouponUsedStepSchema>,
): Promise<ExecuteStepResult> {
  try {
    const result = await couponService.markCouponUsed({
      workspaceId: props.conversation.workspaceId,
      topicId: props.step.topicId,
      contactId: props.conversation.contactId,
    })
    if (!result.ok) {
      logger.warn(
        {
          workspaceId: props.conversation.workspaceId,
          topicId: props.step.topicId,
          contactId: props.conversation.contactId,
          conversationId: props.conversation.id,
          action: props.step.stepType,
          reason: result.reason,
        },
        "Coupon mark-used skipped",
      )
    }
    return { status: "success", result }
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        workspaceId: props.conversation.workspaceId,
        topicId: props.step.topicId,
        contactId: props.conversation.contactId,
        conversationId: props.conversation.id,
        action: props.step.stepType,
      },
      "Coupon mark-used failed",
    )
    return { status: "error", result: null }
  }
}
