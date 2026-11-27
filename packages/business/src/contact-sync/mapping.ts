import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  type ContactSyncMappingPage,
  contactSyncMappingRepository,
  type UpsertContactSyncMappingInput,
} from "@chatbotx.io/database/repositories"
import { customFieldModel, tagModel } from "@chatbotx.io/database/schema"
import type { ContactSyncMappingModel } from "@chatbotx.io/database/types"
import { isReservedFieldName } from "@chatbotx.io/flow-config/field-reference"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { customFieldService } from "../custom-field/service"
import { tagService } from "../tag/service"
import { externalFieldTypeTargets } from "./field-type"
import type {
  ContactSyncExternalField,
  ContactSyncExternalTag,
  ContactSyncSchema,
} from "./types"

export type MappedField = {
  customFieldId: string
  type: CustomFieldType
  origin: ContactSyncMappingModel["origin"]
}

export type MappedTag = {
  tagId: string
  origin: ContactSyncMappingModel["origin"]
}

/** The live mappings of one source: external id → workspace target. */
export type ContactSyncMappingState = {
  tags: Map<string, MappedTag>
  fields: Map<string, MappedField>
}

type MappingScope = { workspaceId: string; page: ContactSyncMappingPage }

/** Name and type of the workspace's custom fields among `ids`, by id. */
export const loadCustomFieldsByIds = async (
  workspaceId: string,
  ids: string[],
): Promise<Map<string, { name: string; type: CustomFieldType }>> => {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = await db
    .select({
      id: customFieldModel.id,
      name: customFieldModel.name,
      type: customFieldModel.type,
    })
    .from(customFieldModel)
    .where(
      and(
        eq(customFieldModel.workspaceId, workspaceId),
        inArray(customFieldModel.id, [...new Set(ids)]),
      ),
    )
  return new Map(rows.map((row) => [row.id, row] as const))
}

/**
 * Reads the mappings of the tags and fields the source lists now (`schema`),
 * keeping only targets that still exist in the workspace: the read is bounded
 * by the schema, never by how many mappings past runs stored. A mapping whose
 * tag was soft-deleted is removed, so the next resolution treats that source
 * tag as unmapped again (a deleted custom field cascades its mapping away).
 */
export const loadContactSyncMappingState = async (
  scope: MappingScope,
  schema: ContactSyncSchema,
): Promise<ContactSyncMappingState> => {
  const rows = await contactSyncMappingRepository.listForExternalIds({
    ...scope,
    tagIds: schema.tags.map((tag) => tag.id),
    fieldIds: schema.fields.map((field) => field.id),
  })
  const tagIds = rows.flatMap((row) => (row.tagId ? [row.tagId] : []))
  const fieldIds = rows.flatMap((row) =>
    row.customFieldId ? [row.customFieldId] : [],
  )
  const [liveTagIds, fieldsById] = await Promise.all([
    loadLiveTagIds(scope.workspaceId, tagIds),
    loadCustomFieldsByIds(scope.workspaceId, fieldIds),
  ])

  const state: ContactSyncMappingState = {
    tags: new Map(),
    fields: mappedFields(rows, fieldsById),
  }
  const staleTags: { externalId: string; tagId: string }[] = []
  for (const row of rows) {
    if (!row.tagId) {
      continue
    }
    if (liveTagIds.has(row.tagId)) {
      state.tags.set(row.externalId, { tagId: row.tagId, origin: row.origin })
    } else {
      staleTags.push({ externalId: row.externalId, tagId: row.tagId })
    }
  }
  await contactSyncMappingRepository.deleteStaleTagMappings({
    ...scope,
    stale: staleTags,
  })
  return state
}

const loadLiveTagIds = async (
  workspaceId: string,
  ids: string[],
): Promise<Set<string>> => {
  if (ids.length === 0) {
    return new Set()
  }
  const rows = await db
    .select({ id: tagModel.id })
    .from(tagModel)
    .where(
      and(
        eq(tagModel.workspaceId, workspaceId),
        inArray(tagModel.id, [...new Set(ids)]),
        isNull(tagModel.deletedAt),
      ),
    )
  return new Set(rows.map((row) => row.id))
}

/** Field mappings whose target still exists, keyed by source id. */
const mappedFields = (
  rows: ContactSyncMappingModel[],
  fieldsById: Map<string, { type: CustomFieldType }>,
): Map<string, MappedField> => {
  const fields = new Map<string, MappedField>()
  for (const row of rows) {
    const field = row.customFieldId
      ? fieldsById.get(row.customFieldId)
      : undefined
    if (row.kind === "customField" && row.customFieldId && field) {
      fields.set(row.externalId, {
        customFieldId: row.customFieldId,
        type: field.type,
        origin: row.origin,
      })
    }
  }
  return fields
}

/**
 * Gives every unmapped source tag a workspace tag of the same name (created
 * when missing) and records it as an `auto` mapping, so later runs reuse it.
 * Emits nothing. Returns the state extended with the new targets.
 */
export const resolveUnmappedTags = async (input: {
  scope: MappingScope
  state: ContactSyncMappingState
  tags: ContactSyncExternalTag[]
}): Promise<ContactSyncMappingState> => {
  const unmapped = [
    ...new Map(
      input.tags
        .filter((tag) => !input.state.tags.has(tag.id))
        .map((tag) => [tag.id, tag] as const),
    ).values(),
  ]
  if (unmapped.length === 0) {
    return input.state
  }
  const created = await tagService.upsertByNames({
    workspaceId: input.scope.workspaceId,
    names: unmapped.map((tag) => tag.name),
  })
  // Not an event: only the cached tag lists, so new tags show up at once.
  await tagService.invalidateWorkspaceTags(input.scope.workspaceId)
  const idByName = new Map(created.map((tag) => [tag.name, tag.id] as const))
  const rows: UpsertContactSyncMappingInput[] = unmapped.flatMap((tag) => {
    const tagId = idByName.get(tag.name.trim())
    return tagId
      ? [
          {
            kind: "tag" as const,
            externalId: tag.id,
            externalName: tag.name,
            tagId,
            customFieldId: null,
          },
        ]
      : []
  })
  const stored = await contactSyncMappingRepository.insertAutoAndRead({
    ...input.scope,
    rows,
  })
  const tags = new Map(input.state.tags)
  for (const row of stored) {
    if (row.tagId) {
      tags.set(row.externalId, { tagId: row.tagId, origin: row.origin })
    }
  }
  return { ...input.state, tags }
}

/**
 * Gives every unmapped source field a workspace field: the same name and
 * default type is reused, a name already used by another type gets a new
 * `<name> copy` field. Recorded as an `auto` mapping so the next run reuses
 * it instead of creating `copy 2`. Emits nothing.
 */
export const resolveUnmappedFields = async (input: {
  scope: MappingScope
  state: ContactSyncMappingState
  fields: ContactSyncExternalField[]
}): Promise<ContactSyncMappingState> => {
  const unmapped = [
    ...new Map(
      input.fields
        // A name a field may not have (`bot_field:` prefix) is never created.
        .filter(
          (field) =>
            !(
              input.state.fields.has(field.id) ||
              isReservedFieldName(field.name)
            ),
        )
        .map((field) => [field.id, field] as const),
    ).values(),
  ]
  if (unmapped.length === 0) {
    return input.state
  }
  const requests = unmapped.map((field) => ({
    externalId: field.id,
    externalName: field.name,
    name: field.name,
    type: externalFieldTypeTargets[field.type].default as CustomFieldType,
  }))
  const { idMap } = await customFieldService.resolveByNameAndType({
    workspaceId: input.scope.workspaceId,
    fields: requests.map(({ name, type }) => ({ name, type })),
    renameStyle: "copy",
  })
  const rows: UpsertContactSyncMappingInput[] = requests.flatMap((request) => {
    const customFieldId = idMap.get(customFieldResolutionKey(request))
    return customFieldId
      ? [
          {
            kind: "customField" as const,
            externalId: request.externalId,
            externalName: request.externalName,
            tagId: null,
            customFieldId,
          },
        ]
      : []
  })
  const stored = await contactSyncMappingRepository.insertAutoAndRead({
    ...input.scope,
    rows,
  })
  const fieldsById = await loadCustomFieldsByIds(
    input.scope.workspaceId,
    stored.flatMap((row) => (row.customFieldId ? [row.customFieldId] : [])),
  )
  return {
    ...input.state,
    fields: new Map([
      ...input.state.fields,
      ...mappedFields(stored, fieldsById),
    ]),
  }
}
