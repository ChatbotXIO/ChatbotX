import "server-only"

import { contactInboxService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  CONTACT_VARIABLE_PATTERN,
  type DisplayText,
  type DisplayTextContext,
  displayTexts,
  escapeContactValue,
  hasContactVariable,
  type MiniAppDefinition,
  mapDisplayText,
} from "@chatbotx.io/mini-app"
import { contactVariableService } from "@chatbotx.io/variables"

const logger = getChildLogger("mini-apps:resolve-contact-variables")

type ResolveContactVariablesProps = {
  definition: MiniAppDefinition
  workspaceId: string
  /** The verified contact behind the link; anonymous visitors have none. */
  contactId?: string
}

const stripContactVariables = (text: string): string =>
  text.replace(CONTACT_VARIABLE_PATTERN, "")

// The same text is escaped differently as markdown and as plain text.
const textKey = (text: string, context: DisplayTextContext) =>
  `${context.markdown ? "md" : "plain"}:${text}`

const collectTextsWithVariables = (definition: MiniAppDefinition) => {
  const texts = new Map<string, DisplayText>()
  for (const entry of displayTexts(definition)) {
    if (hasContactVariable(entry.text)) {
      texts.set(textKey(entry.text, entry.context), entry)
    }
  }
  return [...texts.values()]
}

const resolveTexts = async (props: {
  texts: DisplayText[]
  workspaceId: string
  contactId: string
}): Promise<Map<string, string>> => {
  // Custom fields belong to the contact, so a contact without an inbox (e.g.
  // imported) still resolves them; only inbox-based variables come out empty.
  const contactInbox = await contactInboxService.findRecentByContactId({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
  })
  const variables = await contactVariableService.getAll({
    contactId: props.contactId,
    contactInbox: contactInbox ?? null,
  })
  const resolved = await Promise.all(
    props.texts.map(
      async ({ text, context }) =>
        [
          textKey(text, context),
          await contactVariableService.replaceAll({
            text,
            variables,
            escapeValue: (value) => escapeContactValue(value, text, context),
          }),
        ] as const,
    ),
  )
  return new Map(resolved)
}

/**
 * Swaps every `{{variable}}` in the Mini App's visitor-facing texts for the
 * contact's real value, server-side, so custom field values never reach a
 * visitor without a valid link token. Values are escaped for where they land,
 * so the runner shows them as plain text. Anonymous visitors (or a lookup that
 * fails) see the texts with the variables removed.
 */
export async function resolveContactVariables(
  props: ResolveContactVariablesProps,
): Promise<MiniAppDefinition> {
  const texts = collectTextsWithVariables(props.definition)
  if (texts.length === 0) {
    return props.definition
  }

  let resolved = new Map<string, string>()
  if (props.contactId) {
    try {
      resolved = await resolveTexts({
        texts,
        workspaceId: props.workspaceId,
        contactId: props.contactId,
      })
    } catch (error) {
      logger.warn(
        { err: error, contactId: props.contactId },
        "Failed to resolve Mini App contact variables",
      )
    }
  }

  // Any variable left unresolved is dropped rather than shown raw.
  return mapDisplayText(props.definition, (text, context) =>
    hasContactVariable(text)
      ? stripContactVariables(resolved.get(textKey(text, context)) ?? text)
      : text,
  )
}
