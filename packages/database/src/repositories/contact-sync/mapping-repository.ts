import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  or,
  sql,
} from "../../client"
import type {
  ContactSyncMappingKind,
  ContactSyncProvider,
  ContactSyncSourceChannel,
} from "../../partials"
import { contactSyncMappingModel } from "../../schema"
import type { ContactSyncMappingModel } from "../../types"

/** The page a mapping belongs to; the workspace is always part of the key. */
export type ContactSyncMappingPage = {
  provider: ContactSyncProvider
  channel: ContactSyncSourceChannel
  pageId: string
}

export type UpsertContactSyncMappingInput = {
  kind: ContactSyncMappingKind
  externalId: string
  externalName: string
  tagId: string | null
  customFieldId: string | null
}

/** Rows per insert: about a dozen bind parameters each, far below Postgres' 65,535. */
const MAPPING_WRITE_CHUNK_SIZE = 1000

// A function, not a constant: columns are read when a query runs, never at
// import, like every other repository (a mocked schema stays importable).
const mappingConflictTarget = () => [
  contactSyncMappingModel.workspaceId,
  contactSyncMappingModel.provider,
  contactSyncMappingModel.channel,
  contactSyncMappingModel.pageId,
  contactSyncMappingModel.kind,
  contactSyncMappingModel.externalId,
]

const pageScope = (page: ContactSyncMappingPage) =>
  and(
    eq(contactSyncMappingModel.provider, page.provider),
    eq(contactSyncMappingModel.channel, page.channel),
    eq(contactSyncMappingModel.pageId, page.pageId),
  )

/** The input rows as table rows of one origin, in insert-sized chunks. */
const mappingRowChunks = (
  input: {
    workspaceId: string
    page: ContactSyncMappingPage
    rows: UpsertContactSyncMappingInput[]
  },
  origin: ContactSyncMappingModel["origin"],
) => {
  const rows = input.rows.map((row) => ({
    ...row,
    workspaceId: input.workspaceId,
    ...input.page,
    origin,
  }))
  const chunks: (typeof rows)[] = []
  for (
    let offset = 0;
    offset < rows.length;
    offset += MAPPING_WRITE_CHUNK_SIZE
  ) {
    chunks.push(rows.slice(offset, offset + MAPPING_WRITE_CHUNK_SIZE))
  }
  return chunks
}

export const contactSyncMappingRepository = {
  /**
   * The source's mappings of the given source ids only: ids the source no
   * longer lists are never read, so the read stays bounded by its schema
   * however many mappings past runs stored.
   */
  async listForExternalIds(
    input: {
      workspaceId: string
      page: ContactSyncMappingPage
      tagIds: string[]
      fieldIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncMappingModel[]> {
    const byKind = (kind: ContactSyncMappingKind, externalIds: string[]) =>
      externalIds.length > 0
        ? and(
            eq(contactSyncMappingModel.kind, kind),
            inArray(contactSyncMappingModel.externalId, externalIds),
          )
        : undefined
    const kinds = or(
      byKind("tag", input.tagIds),
      byKind("customField", input.fieldIds),
    )
    if (!kinds) {
      return []
    }
    return await tx
      .select()
      .from(contactSyncMappingModel)
      .where(
        and(
          eq(contactSyncMappingModel.workspaceId, input.workspaceId),
          pageScope(input.page),
          kinds,
        ),
      )
  },

  /**
   * The user's choices replace whatever was there for those source ids
   * (manual or auto): a manual mapping always wins.
   */
  async upsertManual(
    input: {
      workspaceId: string
      page: ContactSyncMappingPage
      rows: UpsertContactSyncMappingInput[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    for (const chunk of mappingRowChunks(input, "manual")) {
      await tx
        .insert(contactSyncMappingModel)
        .values(chunk)
        .onConflictDoUpdate({
          target: mappingConflictTarget(),
          set: {
            externalName: sql`excluded."externalName"`,
            tagId: sql`excluded."tagId"`,
            customFieldId: sql`excluded."customFieldId"`,
            origin: sql`excluded."origin"`,
            updatedAt: new Date(),
          },
        })
    }
  },

  /** Removes mappings so those source ids are resolved automatically again. */
  async deleteByExternalIds(
    input: {
      workspaceId: string
      page: ContactSyncMappingPage
      kind: ContactSyncMappingKind
      externalIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.externalIds.length === 0) {
      return
    }
    await tx
      .delete(contactSyncMappingModel)
      .where(
        and(
          eq(contactSyncMappingModel.workspaceId, input.workspaceId),
          pageScope(input.page),
          eq(contactSyncMappingModel.kind, input.kind),
          inArray(contactSyncMappingModel.externalId, input.externalIds),
        ),
      )
  },

  /**
   * Drops tag mappings whose tag was deleted. Matches the tag a caller saw
   * too, so a mapping the user re-pointed at a live tag meanwhile is kept.
   */
  async deleteStaleTagMappings(
    input: {
      workspaceId: string
      page: ContactSyncMappingPage
      stale: { externalId: string; tagId: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.stale.length === 0) {
      return
    }
    await tx
      .delete(contactSyncMappingModel)
      .where(
        and(
          eq(contactSyncMappingModel.workspaceId, input.workspaceId),
          pageScope(input.page),
          eq(contactSyncMappingModel.kind, "tag"),
          or(
            ...input.stale.map((row) =>
              and(
                eq(contactSyncMappingModel.externalId, row.externalId),
                eq(contactSyncMappingModel.tagId, row.tagId),
              ),
            ),
          ),
        ),
      )
  },

  /**
   * Records what a run resolved on its own, never over an existing row (a
   * manual choice or another run's result), then reads back what is stored
   * so every caller converges on the same target.
   */
  async insertAutoAndRead(
    input: {
      workspaceId: string
      page: ContactSyncMappingPage
      rows: UpsertContactSyncMappingInput[]
    },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncMappingModel[]> {
    if (input.rows.length === 0) {
      return []
    }
    for (const chunk of mappingRowChunks(input, "auto")) {
      await tx
        .insert(contactSyncMappingModel)
        .values(chunk)
        .onConflictDoNothing({ target: mappingConflictTarget() })
    }
    const kinds = [...new Set(input.rows.map((row) => row.kind))]
    return await tx
      .select()
      .from(contactSyncMappingModel)
      .where(
        and(
          eq(contactSyncMappingModel.workspaceId, input.workspaceId),
          pageScope(input.page),
          inArray(contactSyncMappingModel.kind, kinds),
          inArray(
            contactSyncMappingModel.externalId,
            input.rows.map((row) => row.externalId),
          ),
        ),
      )
  },
}
