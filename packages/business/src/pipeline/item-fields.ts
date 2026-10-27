import type { DatabaseClient } from "@chatbotx.io/database/client"
import { pipelineRepository } from "@chatbotx.io/database/repositories"
import type { PipelineFieldModel } from "@chatbotx.io/database/types"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "../contact-custom-field/normalize"
import { ChatbotXException, validationException } from "../errors"

/**
 * Share-locks the fields a write stores values for, inside the write
 * transaction and after the item lock, and rejects one deleted meanwhile.
 * `deleteField` removes the field row (exclusive lock) before stripping its
 * key, so a write that passes this check is committed before, or visible to,
 * the strip and can never leave a key for a deleted field.
 */
export async function lockFieldsOrFail(input: {
  workspaceId: string
  pipelineId: string
  fieldIds: string[]
  tx: DatabaseClient
}) {
  const ids = [...new Set(input.fieldIds)]
  const existing = await pipelineRepository.lockFieldsShared(
    { workspaceId: input.workspaceId, pipelineId: input.pipelineId, ids },
    input.tx,
  )
  const missing = ids.find((id) => !existing.includes(id))
  if (missing) {
    throw validationException("fieldValues", `Unknown field ${missing}`)
  }
}

/** A value that does not fit the field's type is a 422 on `fieldValues`. */
async function normalizeFieldValue(input: {
  definition: PipelineFieldModel
  raw: string
  resolveSourceTimezone: ReturnType<typeof createSourceTimezoneResolver>
  explicitTimezone?: string
}): Promise<string> {
  const { definition } = input
  try {
    const normalized = await normalizeCustomFieldValueForStorage({
      type: definition.type,
      value: input.raw,
      resolveSourceTimezone: input.resolveSourceTimezone,
      explicitTimezone: input.explicitTimezone,
    })
    if (normalized !== null) {
      return normalized
    }
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      throw error
    }
  }
  throw validationException(
    "fieldValues",
    `Invalid value for ${definition.name}`,
  )
}

/** Merges a field patch into the stored values, normalising each by its type. */
export async function mergeFieldValues(input: {
  definitions: PipelineFieldModel[]
  current: Record<string, string>
  patch: Record<string, string | null>
  explicitTimezone?: string
  workspaceId: string
  pipelineId: string
  contactId: string
  tx: DatabaseClient
}): Promise<Record<string, string>> {
  const merged = { ...input.current }
  const resolveSourceTimezone = createSourceTimezoneResolver({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    tx: input.tx,
  })
  const definitionById = new Map(
    input.definitions.map((field) => [field.id, field]),
  )
  for (const fieldId of Object.keys(input.patch)) {
    if (!definitionById.has(fieldId)) {
      throw validationException("fieldValues", `Unknown field ${fieldId}`)
    }
  }
  await lockFieldsOrFail({
    workspaceId: input.workspaceId,
    pipelineId: input.pipelineId,
    fieldIds: Object.entries(input.patch)
      .filter(([, raw]) => raw !== null && raw !== "")
      .map(([fieldId]) => fieldId),
    tx: input.tx,
  })
  for (const [fieldId, raw] of Object.entries(input.patch)) {
    const definition = definitionById.get(fieldId)
    if (!definition) {
      throw validationException("fieldValues", `Unknown field ${fieldId}`)
    }
    if (raw === null || raw === "") {
      delete merged[fieldId]
      continue
    }
    merged[fieldId] = await normalizeFieldValue({
      definition,
      raw,
      resolveSourceTimezone,
      explicitTimezone: input.explicitTimezone,
    })
  }
  return merged
}

export function assertRequiredFields(
  definitions: PipelineFieldModel[],
  values: Record<string, string>,
  onlyFieldIds?: string[],
) {
  const missing = definitions.find(
    (field) =>
      field.required &&
      !values[field.id] &&
      (!onlyFieldIds || onlyFieldIds.includes(field.id)),
  )
  if (missing) {
    throw validationException("fieldValues", `${missing.name} is required`)
  }
}

/** Keeps values whose destination field has the same reference name and type. */
export function remapFieldValues(
  source: PipelineFieldModel[],
  destination: PipelineFieldModel[],
  values: Record<string, string>,
): Record<string, string> {
  const remapped: Record<string, string> = {}
  for (const field of source) {
    const value = values[field.id]
    const target = destination.find(
      (candidate) =>
        candidate.referenceName === field.referenceName &&
        candidate.type === field.type,
    )
    if (value !== undefined && target) {
      remapped[target.id] = value
    }
  }
  return remapped
}
