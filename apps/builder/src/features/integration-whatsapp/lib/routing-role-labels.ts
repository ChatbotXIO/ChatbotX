import type { useTranslations } from "next-intl"

type Translate = ReturnType<typeof useTranslations>

/**
 * Meta's routing role values (`GET /{phone_number_id}/routing_roles`) mapped to
 * their labels. Brand-neutral copy (white-label).
 */
const ROUTING_ROLE_LABEL_KEYS = {
  calls: "conversationRouting.roles.calls",
  ctwa: "conversationRouting.roles.ctwa",
  customer_service: "conversationRouting.roles.customer_service",
  escalation: "conversationRouting.roles.escalation",
  marketing: "conversationRouting.roles.marketing",
  utility: "conversationRouting.roles.utility",
} as const

type KnownRoutingRole = keyof typeof ROUTING_ROLE_LABEL_KEYS

const isKnownRoutingRole = (role: string): role is KnownRoutingRole =>
  Object.hasOwn(ROUTING_ROLE_LABEL_KEYS, role)

/** A role Meta may add later still renders, under a generic label. */
export function routingRoleLabel(t: Translate, role: string): string {
  return isKnownRoutingRole(role)
    ? t(ROUTING_ROLE_LABEL_KEYS[role])
    : t("conversationRouting.roles.other")
}
