import { couponService } from "@chatbotx.io/business/coupon"
import type { ReplaceVariableProps } from "./schema"

export const COUPON_VARIABLE_PREFIX = "coupon:"

export const isCouponVariable = (variable: string): boolean =>
  variable.startsWith(COUPON_VARIABLE_PREFIX)

export const getCouponVariableTopicId = (variable: string): string | null => {
  if (!isCouponVariable(variable)) {
    return null
  }
  const topicId = variable.slice(COUPON_VARIABLE_PREFIX.length).trim()
  return topicId || null
}

export const resolveCouponVariable = async (
  variables: ReplaceVariableProps,
  variable: string,
): Promise<string> => {
  const topicId = getCouponVariableTopicId(variable)
  if (!(topicId && variables.contact?.id && variables.workspace?.id)) {
    return ""
  }

  return await couponService.resolveCouponVariable({
    workspaceId: variables.workspace.id,
    contactId: variables.contact.id,
    topicId,
  })
}
