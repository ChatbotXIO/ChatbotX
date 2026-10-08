import type { MatchingTemplateResolver } from "@chatbotx.io/business"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"

const UNRESOLVED_PLACEHOLDER = "{{"

/** Blank, or a variable that did not resolve, is "no value". */
const usable = (value: string | null): string | null =>
  value && !value.includes(UNRESOLVED_PLACEHOLDER) && value.trim() !== ""
    ? value
    : null

/**
 * Resolves the customer-matching `{{variable}}`s against the CURRENT contact,
 * in one variable load, when a conversion is delivered. The values go straight
 * to the hasher; nothing here logs, throws with or stores them.
 */
export const resolveMatchingTemplates: MatchingTemplateResolver = async ({
  contactId,
  contactInbox,
  templates,
}) => {
  const resolved = await resolveContactVariablesDeep(contactId, templates, {
    contactInbox,
  })
  return { email: usable(resolved.email), phone: usable(resolved.phone) }
}
