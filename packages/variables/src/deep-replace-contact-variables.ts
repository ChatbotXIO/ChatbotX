import type {
  ContactInboxModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { applySpintax, containsSpintax } from "@chatbotx.io/utils/spintax"
import { contactVariableService } from "./contact-variable"
import type { ReplaceVariableProps } from "./schema"

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/** Sync tree walk: true if any string leaf satisfies `predicate`. */
const someString = (
  value: unknown,
  predicate: (text: string) => boolean,
): boolean => {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === "string") {
    return predicate(value)
  }
  if (Array.isArray(value)) {
    return value.some((item) => someString(item, predicate))
  }
  if (isPlainObject(value)) {
    return Object.values(value).some((item) => someString(item, predicate))
  }
  return false
}

/** Sync tree walk: true if any string in the structure contains `{{`. */
export const valueContainsVariablePlaceholder = (value: unknown): boolean =>
  someString(value, (text) => text.includes("{{"))

/**
 * `variables` is null when the structure holds spintax but no `{{placeholder}}`
 * — there is nothing to look up, so contact data was never loaded.
 */
const deepReplaceStrings = async <T>(
  value: T,
  variables: ReplaceVariableProps | null,
  spintax: boolean,
): Promise<T> => {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === "string") {
    // Spintax first, so contact data substituted below is never itself spun:
    // `{{chat_history}}` and `{{last_input}}` carry text the contact typed, and
    // a `{a|b}` in there must reach the channel verbatim.
    const spun = spintax ? applySpintax(value) : value
    if (!(variables && spun.includes("{{"))) {
      return spun as T
    }
    return (await contactVariableService.replaceAll({
      variables,
      text: spun,
    })) as T
  }
  if (Array.isArray(value)) {
    const next = await Promise.all(
      value.map((item) => deepReplaceStrings(item, variables, spintax)),
    )
    return next as T
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = await deepReplaceStrings(value[key], variables, spintax)
    }
    return out as T
  }
  return value
}

export type ResolveContactVariablesDeepOptions = {
  /**
   * Also resolve `{a|b|c}` spintax blocks in every string leaf, before the
   * variable pass. Off by default and opted into per call site: a JSON body,
   * an AI prompt (`{"status": "ok" | "error"}`) or a CSS rule is a valid block
   * by grammar, so only callers that know a structure is prose may turn it on.
   */
  spintax?: boolean
}

/**
 * Recursively replaces `{{var}}` in every string leaf. Loads contact data once
 * when any placeholder exists; otherwise returns the input unchanged.
 */
export const resolveContactVariablesDeep = async <T>(
  contactId: string,
  value: T,
  source: {
    contactInbox: ContactInboxModel | string
    conversation?: ConversationModel | null
    workspace?: WorkspaceModel
    appointmentId?: string
  },
  options: ResolveContactVariablesDeepOptions = {},
): Promise<T> => {
  const spintax = options.spintax === true
  const hasPlaceholder = valueContainsVariablePlaceholder(value)
  if (!(hasPlaceholder || (spintax && someString(value, containsSpintax)))) {
    return value
  }
  const variables = hasPlaceholder
    ? await contactVariableService.getAll({
        contactId,
        ...source,
      })
    : null
  return deepReplaceStrings(value, variables, spintax)
}
