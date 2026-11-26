import {
  type ChannelType,
  contactSources,
} from "@chatbotx.io/database/partials"
import {
  type ContactProfilePatch,
  type ContactSyncItemCounters,
  type ContactSyncMappingPage,
  contactCustomFieldRepository,
  contactRepository,
} from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  type CoexistDedupContact,
  type ContactImportLink,
  coexistImportService,
} from "../coexist-import/service"
import { contactService } from "../contact/service"
import { validateCustomFieldValue } from "../javascript-execution/custom-field-value"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"
import { externalValueToText, isCompatibleFieldType } from "./field-type"
import {
  type ContactSyncMappingState,
  resolveUnmappedFields,
  resolveUnmappedTags,
} from "./mapping"
import {
  buildContactSyncProfile,
  type ContactSyncNormalizeContext,
  resolveContactSyncIdentity,
} from "./profile-fields"
import type {
  ContactSyncExternalField,
  ContactSyncRecord,
  ContactSyncSchema,
} from "./types"

const log = getChildLogger("contact-sync")

export type ContactSyncImportContext = ContactSyncNormalizeContext & {
  workspaceId: string
  ownerId: string
  workspaceTimezone: string
}

export type ContactSyncImportOptions = {
  syncTags: boolean
  syncCustomFields: boolean
  overwriteExisting: boolean
}

type ImportedRecord = {
  record: ContactSyncRecord
  sourceId: string
  profile: ContactProfilePatch
}

/** Keeps the last record of each identity, so a page never writes one contact twice. */
const dedupeByIdentity = (
  records: ContactSyncRecord[],
  channel: ChannelType,
  context: ContactSyncImportContext,
) => {
  const byIdentity = new Map<string, ImportedRecord>()
  const dedup = new Map<string, CoexistDedupContact>()
  let skipped = 0
  for (const record of records) {
    const identity = resolveContactSyncIdentity(record, channel, context)
    if (!identity) {
      skipped += 1
      continue
    }
    if (byIdentity.has(identity.sourceId)) {
      skipped += 1
    }
    const profile = buildContactSyncProfile(record, context)
    byIdentity.set(identity.sourceId, {
      record,
      sourceId: identity.sourceId,
      profile,
    })
    dedup.set(identity.sourceId, {
      sourceId: identity.sourceId,
      ...(identity.sourceUserId && { sourceUserId: identity.sourceUserId }),
      profile,
    })
  }
  return { imported: [...byIdentity.values()], dedup, skipped }
}

type ContactSyncFieldEntry = {
  contactId: string
  customFieldId: string
  value: string
}

/**
 * Normalized values of the mapped fields of one record. A value of a field
 * mapped to an incompatible type, or one the target type rejects (invalid,
 * over its length limit), is dropped — never coerced or truncated — and
 * counted in `skippedValues`. A field without a mapping is not counted.
 */
const fieldEntriesOf = (input: {
  contactId: string
  record: ContactSyncRecord
  fieldsById: Map<string, ContactSyncExternalField>
  state: ContactSyncMappingState
  workspaceTimezone: string
}): { entries: ContactSyncFieldEntry[]; skippedValues: number } => {
  const entries: ContactSyncFieldEntry[] = []
  let skippedValues = 0
  for (const fieldValue of input.record.fieldValues) {
    const source = input.fieldsById.get(fieldValue.id)
    const target = input.state.fields.get(fieldValue.id)
    if (!(source && target)) {
      continue
    }
    const value = isCompatibleFieldType(source.type, target.type)
      ? validateCustomFieldValue(
          target.type,
          externalValueToText(fieldValue.value),
          input.workspaceTimezone,
        )
      : null
    if (value === null) {
      skippedValues += 1
      continue
    }
    entries.push({
      contactId: input.contactId,
      customFieldId: target.customFieldId,
      value,
    })
  }
  return { entries, skippedValues }
}

/**
 * Imports one page of source records into an inbox. Creates missing
 * contacts, merges profiles of existing ones (fill or overwrite), attaches
 * tags (always additive) and writes custom-field values — and emits NOTHING:
 * no event, trigger, flow, webhook, tag sync or ads conversion. Every write
 * converges, so replaying a page after a crash never duplicates data.
 */
export async function importContactSyncPage(input: {
  context: ContactSyncImportContext
  page: ContactSyncMappingPage
  inbox: { id: string; channel: ChannelType }
  records: ContactSyncRecord[]
  schema: ContactSyncSchema
  state: ContactSyncMappingState
  options: ContactSyncImportOptions
}): Promise<{
  counters: ContactSyncItemCounters
  state: ContactSyncMappingState
}> {
  const { context, inbox, options } = input
  const { workspaceId } = context
  const { imported, dedup, skipped } = dedupeByIdentity(
    input.records,
    inbox.channel,
    context,
  )
  if (imported.length === 0) {
    return {
      counters: {
        created: 0,
        updated: 0,
        skipped,
        failed: 0,
        skippedValues: 0,
      },
      state: input.state,
    }
  }

  const links = await coexistImportService.resolveOrCreateContactLinks({
    // Silent import: no profile-snapshot job for these contacts.
    captureProfileSnapshot: false,
    source: contactSources.enum.imported,
    workspaceId,
    inboxId: inbox.id,
    inboxChannel: inbox.channel,
    dedup,
    sourceIds: [...dedup.keys()],
    sourceUserIds: [...dedup.values()].flatMap((entry) =>
      entry.sourceUserId ? [entry.sourceUserId] : [],
    ),
  })
  // Counted at once: a later step (profiles, tags, fields) that fails would
  // otherwise leave created contacts uncounted, and a retry sees them as
  // existing.
  await recordCreatedContacts(context, links.importedContacts)
  // The helper's creation events are deliberately dropped: nothing is emitted.
  const createdContactIds = new Set(
    links.newContactCreatedEvents.map((event) => event.contactId),
  )

  const linked = imported.flatMap((entry) => {
    const link = links.contactInboxIds.get(entry.sourceId)
    return link ? [{ ...entry, contactId: link.contactId, link }] : []
  })
  const existing = linked.filter(
    (entry) => !createdContactIds.has(entry.contactId),
  )

  await contactRepository.mergeProfiles({
    workspaceId,
    mode: options.overwriteExisting ? "overwrite" : "fill",
    rows: existing.map((entry) => ({
      contactId: entry.contactId,
      patch: entry.profile,
    })),
  })

  const step = {
    scope: { workspaceId, page: input.page },
    linked,
    options,
  }
  let state = input.state
  if (options.syncTags) {
    state = await importTags({ ...step, state, schema: input.schema })
  }
  let skippedValues = 0
  if (options.syncCustomFields) {
    const fields = await importFieldValues({
      ...step,
      state,
      schema: input.schema,
      workspaceTimezone: context.workspaceTimezone,
    })
    state = fields.state
    skippedValues = fields.skippedValues
  }

  if (existing.length > 0) {
    await contactService.invalidate({
      workspaceId,
      ids: existing.map((entry) => entry.contactId),
    })
  }

  return {
    counters: {
      created: links.importedContacts,
      updated: existing.length,
      skipped,
      failed: imported.length - linked.length,
      skippedValues,
    },
    state,
  }
}

type LinkedRecord = ImportedRecord & {
  contactId: string
  link: ContactImportLink
}

type ImportStepInput = {
  scope: { workspaceId: string; page: ContactSyncMappingPage }
  linked: LinkedRecord[]
  options: ContactSyncImportOptions
  state: ContactSyncMappingState
}

/**
 * Maps the page's source tags (creating missing ones) and attaches them;
 * never removes a tag. Only tags the source lists in its schema count, as
 * for fields: a page can never name more distinct tags than the schema has.
 */
const importTags = async (
  input: ImportStepInput & { schema: ContactSyncSchema },
): Promise<ContactSyncMappingState> => {
  const schemaTags = new Map(
    input.schema.tags.map((tag) => [tag.id, tag] as const),
  )
  const knownTagsOf = (record: ContactSyncRecord) =>
    record.tags.flatMap((tag) => {
      const known = schemaTags.get(tag.id)
      return known ? [known] : []
    })
  const state = await resolveUnmappedTags({
    scope: input.scope,
    state: input.state,
    tags: input.linked.flatMap((entry) => knownTagsOf(entry.record)),
  })
  const pairs: { contactId: string; tagId: string }[] = []
  for (const entry of input.linked) {
    for (const tag of knownTagsOf(entry.record)) {
      const target = state.tags.get(tag.id)
      if (target) {
        pairs.push({ contactId: entry.contactId, tagId: target.tagId })
      }
    }
  }
  await contactRepository.linkTags({
    workspaceId: input.scope.workspaceId,
    pairs,
  })
  return state
}

/**
 * Maps the page's source fields (creating missing ones) and writes their
 * values. `skippedValues` counts values not written: incompatible mapping,
 * invalid for the target type, or dropped by the write (field deleted
 * meanwhile, another value already given for the same field).
 */
const importFieldValues = async (
  input: ImportStepInput & {
    schema: ContactSyncSchema
    workspaceTimezone: string
  },
): Promise<{ state: ContactSyncMappingState; skippedValues: number }> => {
  const fieldsById = new Map(
    input.schema.fields.map((field) => [field.id, field] as const),
  )
  const state = await resolveUnmappedFields({
    scope: input.scope,
    state: input.state,
    fields: input.linked.flatMap((entry) =>
      entry.record.fieldValues.flatMap((value) => {
        const field = fieldsById.get(value.id)
        return field ? [field] : []
      }),
    ),
  })
  const entries: ContactSyncFieldEntry[] = []
  let skippedValues = 0
  for (const entry of input.linked) {
    const values = fieldEntriesOf({
      contactId: entry.contactId,
      record: entry.record,
      fieldsById,
      state,
      workspaceTimezone: input.workspaceTimezone,
    })
    entries.push(...values.entries)
    skippedValues += values.skippedValues
  }
  const { dropped } = await contactCustomFieldRepository.bulkUpsertValues({
    workspaceId: input.scope.workspaceId,
    mode: input.options.overwriteExisting ? "overwrite" : "fill",
    entries,
  })
  return { state, skippedValues: skippedValues + dropped }
}

/** Quota and usage grow by contacts actually created, as file import does. */
const recordCreatedContacts = async (
  context: ContactSyncImportContext,
  created: number,
) => {
  if (created <= 0) {
    return
  }
  await quotaEnforcementService.incrementBy({
    userId: context.ownerId,
    metric: "contacts",
    count: created,
  })
  await workspaceUsageService
    .increment(context.workspaceId, "contacts", created)
    .catch((err) => {
      log.warn(
        { err, workspaceId: context.workspaceId },
        "workspace usage contact increment failed",
      )
    })
}
