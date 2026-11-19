import { and, db, eq, inArray, isNull, or } from "@chatbotx.io/database/client"
import type {
  ContactSyncMappingIssueReason,
  ContactSyncMappingKind,
  CustomFieldType,
} from "@chatbotx.io/database/partials"
import type { UpsertContactSyncMappingInput } from "@chatbotx.io/database/repositories"
import { customFieldModel, tagModel } from "@chatbotx.io/database/schema"
import type { ContactSyncMappingIssue } from "./errors"
import { isCompatibleFieldType } from "./field-type"
import type { ContactSyncExternalField, ContactSyncSchema } from "./types"

/** A workspace tag given by id or by exact name. */
type TagTarget = { tagId: string } | { tagName: string }

/** A workspace field given by id or by exact name and type. */
type FieldTarget =
  | { customFieldId: string }
  | { customFieldName: string; customFieldType: CustomFieldType }

export type ContactSyncTagMappingInput = {
  externalId: string
  /** `null` removes the mapping: the tag is matched by name again. */
  target: TagTarget | null
}

export type ContactSyncFieldMappingInput = {
  externalId: string
  /** `null` removes the mapping: the field is matched by name again. */
  target: FieldTarget | null
}

/** What one kind of rows writes, or why rows are refused. */
type MappingRowsPlan = {
  issues: ContactSyncMappingIssue[]
  upserts: UpsertContactSyncMappingInput[]
  removals: string[]
}

/** What a `saveMappings` call writes, or why it is refused. */
export type ContactSyncMappingPlan = {
  issues: ContactSyncMappingIssue[]
  upserts: UpsertContactSyncMappingInput[]
  tagRemovals: string[]
  fieldRemovals: string[]
}

/** A row's target, resolved to a workspace id or refused with a reason. */
type TargetResolution =
  | { resolved: true; targetId: string }
  | { resolved: false; reason: ContactSyncMappingIssueReason }

const refused = (reason: ContactSyncMappingIssueReason): TargetResolution => ({
  resolved: false,
  reason,
})

/**
 * The checks every mapping row goes through, whatever its kind: listed once,
 * known to the source, then either removed (`target: null`) or resolved.
 */
const planRows = <
  Target,
  External extends { id: string; name: string },
>(input: {
  kind: ContactSyncMappingKind
  rows: { externalId: string; target: Target | null }[]
  externals: External[]
  resolve: (target: Target, external: External) => TargetResolution
}): MappingRowsPlan => {
  const externalById = new Map(
    input.externals.map((external) => [external.id, external] as const),
  )
  const counts = new Map<string, number>()
  for (const row of input.rows) {
    counts.set(row.externalId, (counts.get(row.externalId) ?? 0) + 1)
  }
  const plan: MappingRowsPlan = { issues: [], upserts: [], removals: [] }
  const issue = (externalId: string, reason: ContactSyncMappingIssueReason) =>
    plan.issues.push({ kind: input.kind, externalId, reason })

  for (const row of input.rows) {
    const external = externalById.get(row.externalId)
    if ((counts.get(row.externalId) ?? 0) > 1) {
      issue(row.externalId, "duplicateExternalId")
      continue
    }
    if (!external) {
      issue(row.externalId, "unknownExternalId")
      continue
    }
    if (row.target === null) {
      plan.removals.push(row.externalId)
      continue
    }
    const resolution = input.resolve(row.target, external)
    if (!resolution.resolved) {
      issue(row.externalId, resolution.reason)
      continue
    }
    plan.upserts.push({
      kind: input.kind,
      externalId: external.id,
      externalName: external.name,
      tagId: input.kind === "tag" ? resolution.targetId : null,
      customFieldId: input.kind === "customField" ? resolution.targetId : null,
    })
  }
  return plan
}

/** Live tags named by id or exact name in the rows; nothing is read for removals only. */
const loadTagTargets = async (
  workspaceId: string,
  rows: ContactSyncTagMappingInput[],
) => {
  const ids: string[] = []
  const names: string[] = []
  for (const { target } of rows) {
    if (target && "tagId" in target) {
      ids.push(target.tagId)
    } else if (target) {
      names.push(target.tagName)
    }
  }
  const found =
    ids.length === 0 && names.length === 0
      ? []
      : await db
          .select({ id: tagModel.id, name: tagModel.name })
          .from(tagModel)
          .where(
            and(
              eq(tagModel.workspaceId, workspaceId),
              isNull(tagModel.deletedAt),
              or(
                ids.length > 0 ? inArray(tagModel.id, ids) : undefined,
                names.length > 0 ? inArray(tagModel.name, names) : undefined,
              ),
            ),
          )
  const liveIds = new Set(found.map((tag) => tag.id))
  const idByName = new Map(found.map((tag) => [tag.name, tag.id] as const))
  return {
    /** The live tag a target names, if any. */
    find: (target: TagTarget): string | undefined => {
      if ("tagId" in target) {
        return liveIds.has(target.tagId) ? target.tagId : undefined
      }
      return idByName.get(target.tagName)
    },
  }
}

const fieldNameTypeKey = (name: string, type: CustomFieldType) =>
  `${type}:${name}`

/** Fields named by id or exact name + type in the rows; nothing is read for removals only. */
const loadFieldTargets = async (
  workspaceId: string,
  rows: ContactSyncFieldMappingInput[],
) => {
  const ids: string[] = []
  const names: string[] = []
  for (const { target } of rows) {
    if (target && "customFieldId" in target) {
      ids.push(target.customFieldId)
    } else if (target) {
      names.push(target.customFieldName)
    }
  }
  const found =
    ids.length === 0 && names.length === 0
      ? []
      : await db
          .select({
            id: customFieldModel.id,
            name: customFieldModel.name,
            type: customFieldModel.type,
          })
          .from(customFieldModel)
          .where(
            and(
              eq(customFieldModel.workspaceId, workspaceId),
              or(
                ids.length > 0 ? inArray(customFieldModel.id, ids) : undefined,
                names.length > 0
                  ? inArray(customFieldModel.name, names)
                  : undefined,
              ),
            ),
          )
  const byId = new Map(found.map((field) => [field.id, field] as const))
  const byNameType = new Map<string, typeof found>()
  for (const field of found) {
    const key = fieldNameTypeKey(field.name, field.type)
    byNameType.set(key, [...(byNameType.get(key) ?? []), field])
  }
  return {
    /** The fields a target can mean: one by id, possibly several by name + type. */
    candidates: (target: FieldTarget): typeof found => {
      if ("customFieldId" in target) {
        const field = byId.get(target.customFieldId)
        return field ? [field] : []
      }
      return (
        byNameType.get(
          fieldNameTypeKey(target.customFieldName, target.customFieldType),
        ) ?? []
      )
    },
  }
}

const resolveFieldTarget = (
  source: ContactSyncExternalField,
  candidates: { id: string; type: CustomFieldType }[],
): TargetResolution => {
  const [candidate, ...others] = candidates
  if (!candidate) {
    return refused("targetNotFound")
  }
  if (others.length > 0) {
    return refused("targetAmbiguous")
  }
  if (!isCompatibleFieldType(source.type, candidate.type)) {
    return refused("typeMismatch")
  }
  return { resolved: true, targetId: candidate.id }
}

/**
 * Checks a `saveMappings` call against the source's schema and the
 * workspace's tags and fields: a target is given by id or by name (a field
 * name needs its type, names repeat across types).
 */
export const planContactSyncMappings = async (input: {
  workspaceId: string
  schema: ContactSyncSchema
  tags: ContactSyncTagMappingInput[]
  fields: ContactSyncFieldMappingInput[]
}): Promise<ContactSyncMappingPlan> => {
  const [tagTargets, fieldTargets] = await Promise.all([
    loadTagTargets(input.workspaceId, input.tags),
    loadFieldTargets(input.workspaceId, input.fields),
  ])
  const tagPlan = planRows({
    kind: "tag",
    rows: input.tags,
    externals: input.schema.tags,
    resolve: (target) => {
      const tagId = tagTargets.find(target)
      if (!tagId) {
        return refused("targetNotFound")
      }
      return { resolved: true, targetId: tagId }
    },
  })
  const fieldPlan = planRows({
    kind: "customField",
    rows: input.fields,
    externals: input.schema.fields,
    resolve: (target, external) =>
      resolveFieldTarget(external, fieldTargets.candidates(target)),
  })
  return {
    issues: [...tagPlan.issues, ...fieldPlan.issues],
    upserts: [...tagPlan.upserts, ...fieldPlan.upserts],
    tagRemovals: tagPlan.removals,
    fieldRemovals: fieldPlan.removals,
  }
}
