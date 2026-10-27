import {
  loadLastPipelineItemId,
  loadPipelineVariableTargets,
  type PipelineVariableTarget,
} from "@chatbotx.io/business/pipeline/variable-targets"
import {
  PIPELINE_REFERENCE_NAME_PATTERN,
  PIPELINE_VARIABLE_ATTRIBUTES,
  type PipelineVariableAttribute,
} from "@chatbotx.io/database/partials"
import { formatMoney } from "@chatbotx.io/utils/money"
import type { PipelineItemsLoader, ReplaceVariableProps } from "./schema"
import { formatDate } from "./utils"

export const PIPELINE_VARIABLE_PREFIX = "pipelines."

const ASSIGNED_ADMINS_SEPARATOR = ", "

const isAttribute = (value: string): value is PipelineVariableAttribute =>
  (PIPELINE_VARIABLE_ATTRIBUTES as readonly string[]).includes(value)

export const parsePipelineVariable = (
  variable: string,
): { referenceName: string; attribute: PipelineVariableAttribute } | null => {
  if (!variable.startsWith(PIPELINE_VARIABLE_PREFIX)) {
    return null
  }
  const parts = variable.slice(PIPELINE_VARIABLE_PREFIX.length).split(".")
  const [referenceName, attribute] = parts
  if (
    parts.length !== 2 ||
    !(referenceName && attribute) ||
    !PIPELINE_REFERENCE_NAME_PATTERN.test(referenceName) ||
    !isAttribute(attribute)
  ) {
    return null
  }
  return { referenceName, attribute }
}

/** A well-formed `pipelines.<ref>.<attr>` token (the pipeline itself may not exist). */
export const isPipelineVariable = (variable: string): boolean =>
  parsePipelineVariable(variable) !== null

/** Memoizes `load`: started by the first call only, then shared. */
const memoize = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loading: Promise<T> | undefined
  return () => {
    loading ??= load()
    return loading
  }
}

/** Lazy loader of the contact's pipeline items, shared by one variables context. */
export const createContactPipelineItemsLoader = (contact: {
  workspaceId: string
  id: string
}): PipelineItemsLoader => {
  const scope = { workspaceId: contact.workspaceId, contactId: contact.id }
  return {
    get: memoize(() => loadPipelineVariableTargets(scope)),
    lastItemId: memoize(() => loadLastPipelineItemId(scope)),
  }
}

const formatTargetValue = (target: PipelineVariableTarget): string =>
  target.value === null
    ? ""
    : formatMoney(target.value, {
        currency: target.currency,
        position: "leftSpace",
      })

const readAttribute = (
  target: PipelineVariableTarget,
  attribute: PipelineVariableAttribute,
  timezone: string | null,
): string => {
  switch (attribute) {
    case "name":
      return target.name
    case "stage_name":
      return target.stageName
    case "status":
      return target.statusLabel
    case "priority":
      return target.priority
    case "value":
      return formatTargetValue(target)
    case "assigned_admins":
      return target.assignedAdmins.join(ASSIGNED_ADMINS_SEPARATOR)
    case "created_date":
      return formatDate(target.createdAt, timezone) ?? ""
    case "due_date":
      return formatDate(target.dueDate, timezone) ?? ""
    case "updated_date":
      return formatDate(target.updatedAt, timezone) ?? ""
    case "id":
      return target.id
    default: {
      const exhaustive: never = attribute
      throw new Error(`Unhandled pipeline attribute: ${String(exhaustive)}`)
    }
  }
}

/**
 * Value of `{{pipelines.<ref>.<attr>}}` for the contact's latest open item in
 * that pipeline, else its latest item. "" when the pipeline does not exist or
 * the contact has no item in it.
 */
export const resolvePipelineVariable = async (
  context: ReplaceVariableProps,
  variable: string,
  timezone: string | null,
): Promise<string> => {
  const parsed = parsePipelineVariable(variable)
  if (!parsed) {
    return ""
  }
  const targets = await context.pipelineItems?.get()
  const target = targets?.find(
    (candidate) => candidate.referenceName === parsed.referenceName,
  )
  return target ? readAttribute(target, parsed.attribute, timezone) : ""
}
