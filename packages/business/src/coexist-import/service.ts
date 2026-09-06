import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  or,
  type SQL,
} from "@chatbotx.io/database/client"
import { contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { messageCleanupService } from "../message-cleanup/service"

/**
 * WHERE clause matching contact-inbox rows in an inbox by EITHER identity
 * column, with the empty-list guard every caller needs (`inArray` must never
 * receive an empty array; `or(single)` is a no-op wrapper). Duplicated from
 * `contact-inbox/service.ts`'s `buildContactInboxIdentityWhere` — kept local
 * here (not imported) because this service must not create a cross-domain
 * import cycle with `contact-inbox`; keep the two in sync if either changes.
 */
const buildContactInboxIdentityWhere = (props: {
  inboxId: string
  sourceIds: string[]
  sourceUserIds: string[]
}): SQL | undefined => {
  const { inboxId, sourceIds, sourceUserIds } = props
  const identityPredicates = [
    ...(sourceIds.length > 0
      ? [inArray(contactInboxModel.sourceId, sourceIds)]
      : []),
    ...(sourceUserIds.length > 0
      ? [inArray(contactInboxModel.sourceUserId, sourceUserIds)]
      : []),
  ]
  return and(eq(contactInboxModel.inboxId, inboxId), or(...identityPredicates))
}

export type ContactImportLink = {
  contactInboxId: string
  contactId: string
  conversationId: string
}

type ContactInboxIdentityRow = {
  id: string
  sourceId: string
  sourceUserId: string | null
  contactId: string
}

const rowsBySourceUserId = <T extends { sourceUserId: string | null }>(
  rows: readonly T[],
): Map<string, T> =>
  new Map(
    rows.flatMap((row) =>
      row.sourceUserId === null ? [] : [[row.sourceUserId, row] as const],
    ),
  )

/**
 * Resolves raced entries whose ContactInbox insert was skipped by the partial
 * (inboxId, sourceUserId) unique index: finds the winner row owning each
 * entry's scoped user id, keyed by the entry's own import sourceId so the
 * caller can alias the import key to the winner's link.
 */
const resolveScopedIdRaceWinners = async (props: {
  tx: DatabaseClient
  inboxId: string
  racedEntries: ReadonlyArray<readonly [string, string]>
}): Promise<Map<string, ContactInboxIdentityRow>> => {
  const { tx, inboxId, racedEntries } = props
  if (racedEntries.length === 0) {
    return new Map()
  }
  const winners = await tx
    .select({
      id: contactInboxModel.id,
      sourceId: contactInboxModel.sourceId,
      sourceUserId: contactInboxModel.sourceUserId,
      contactId: contactInboxModel.contactId,
    })
    .from(contactInboxModel)
    .where(
      and(
        eq(contactInboxModel.inboxId, inboxId),
        inArray(
          contactInboxModel.sourceUserId,
          racedEntries.map(([, scopedId]) => scopedId),
        ),
      ),
    )
  const winnerByScopedId = rowsBySourceUserId(winners)
  const aliases = new Map<string, ContactInboxIdentityRow>()
  for (const [entrySourceId, scopedId] of racedEntries) {
    const winner = winnerByScopedId.get(scopedId)
    if (winner) {
      aliases.set(entrySourceId, winner)
    }
  }
  return aliases
}

export type CoexistDedupContact = {
  sourceId: string
  phoneNumber?: string
  phoneNumberId?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  gender?: string
  sourceUserId?: string
  sourceUsername?: string
}

export type ResolveOrCreateContactLinksInput = {
  workspaceId: string
  inboxId: string
  inboxChannel: string
  dedup: Map<string, CoexistDedupContact>
  sourceIds: string[]
  sourceUserIds: string[]
}

export type NewContactCreatedEvent = {
  workspaceId: string
  contactId: string
  contactInboxId: string
  sourceId: string
  firstName?: string
  phoneNumber?: string
  email?: string
  channel: string
  source: string
  createdAt: Date
}

export type ResolveOrCreateContactLinksResult = {
  importedContacts: number
  contactInboxIds: Map<string, ContactImportLink>
  newContactCreatedEvents: NewContactCreatedEvent[]
}

class CoexistImportService extends BaseService {
  /**
   * Phase 1 of Coexist historical sync, moved VERBATIM (word-diffed against
   * the pre-refactor worker transaction) from
   * `apps/worker/src/integration/handlers/coexist/bulk-historical-import.ts`'s
   * `bulkImportContacts` `db.transaction` body: resolve/insert
   * ContactInbox + Contact + Conversation for a dedup'd batch, healing orphan
   * conversations and reconciling scoped-user-id insert races. The caller
   * (`bulkImportContacts`) owns dedup, post-commit event emission, and
   * workspace-usage accounting — this method only owns the transaction.
   */
  async resolveOrCreateContactLinks(
    input: ResolveOrCreateContactLinksInput,
  ): Promise<ResolveOrCreateContactLinksResult> {
    const {
      workspaceId,
      inboxId,
      inboxChannel,
      dedup,
      sourceIds,
      sourceUserIds,
    } = input

    const newContactCreatedEvents: NewContactCreatedEvent[] = []
    let importedContacts = 0
    const contactInboxIds = new Map<string, ContactImportLink>()

    await db.transaction(async (tx) => {
      // 1. Find existing ContactInbox rows — by sourceId or scoped user id.
      const existingRows = await tx
        .select({
          id: contactInboxModel.id,
          sourceId: contactInboxModel.sourceId,
          sourceUserId: contactInboxModel.sourceUserId,
          contactId: contactInboxModel.contactId,
        })
        .from(contactInboxModel)
        .where(
          buildContactInboxIdentityWhere({
            inboxId,
            sourceIds,
            sourceUserIds,
          }),
        )

      const resolved = new Map<string, ContactImportLink>()
      const existingContactIds = new Set<string>()

      for (const row of existingRows) {
        existingContactIds.add(row.contactId)
        resolved.set(row.sourceId, {
          contactInboxId: row.id,
          contactId: row.contactId,
          conversationId: "",
        })
      }

      const existingBySourceUserId = rowsBySourceUserId(existingRows)
      for (const [sourceId, entry] of dedup) {
        if (resolved.has(sourceId) || !entry.sourceUserId) {
          continue
        }
        const row = existingBySourceUserId.get(entry.sourceUserId)
        if (!row) {
          continue
        }
        existingContactIds.add(row.contactId)
        resolved.set(sourceId, {
          contactInboxId: row.id,
          contactId: row.contactId,
          conversationId: "",
        })
      }

      // Resolve conversation ids for existing contacts. Heal orphans (existing
      // ContactInbox + Contact but missing Conversation) by inserting one now,
      // so downstream callers never receive an empty conversationId.
      if (existingContactIds.size > 0) {
        const conversations = await tx
          .select({
            id: conversationModel.id,
            contactId: conversationModel.contactId,
          })
          .from(conversationModel)
          .where(inArray(conversationModel.contactId, [...existingContactIds]))
        const convByContact = new Map(
          conversations.map((c) => [c.contactId, c.id]),
        )

        const orphanContactIds = [...existingContactIds].filter(
          (cid) => !convByContact.has(cid),
        )
        if (orphanContactIds.length > 0) {
          await tx
            .insert(conversationModel)
            .values(
              orphanContactIds.map((cid) => ({
                id: createId(),
                workspaceId,
                contactId: cid,
              })),
            )
            .onConflictDoNothing()
          const healed = await tx
            .select({
              id: conversationModel.id,
              contactId: conversationModel.contactId,
            })
            .from(conversationModel)
            .where(inArray(conversationModel.contactId, orphanContactIds))
          for (const c of healed) {
            convByContact.set(c.contactId, c.id)
          }
        }

        for (const link of resolved.values()) {
          const cid = convByContact.get(link.contactId)
          if (cid) {
            link.conversationId = cid
          }
        }
      }

      const newEntries = [...dedup.entries()].filter(
        ([sourceId]) => !resolved.has(sourceId),
      )
      const acceptedNew = newEntries

      // 2. Insert Contact + ContactInbox + Conversation for acceptedNew.
      if (acceptedNew.length > 0) {
        const contactRows = acceptedNew.map(([, entry]) => ({
          id: createId(),
          workspaceId,
          firstName: entry.firstName,
          lastName: entry.lastName,
          email: entry.email,
          phoneNumber: entry.phoneNumber,
          avatar: entry.avatar,
        }))

        await tx.insert(contactModel).values(contactRows)

        const contactInboxRows = acceptedNew.map(([sourceId, entry], i) => ({
          id: createId(),
          inboxId,
          contactId: contactRows[i]?.id,
          originalContactId: contactRows[i]?.id,
          source: contactSources.enum.inboundMessage,
          sourceId,
          sourceUserId: entry.sourceUserId ?? null,
          sourceUsername: entry.sourceUsername ?? null,
          channel: inboxChannel,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))

        const conversationRows = acceptedNew.map((_entry, i) => ({
          id: createId(),
          workspaceId,
          contactId: contactRows[i]?.id,
        }))

        // Targetless DO NOTHING: a concurrent import can win EITHER identity
        // index — (inboxId, sourceId) or the partial (inboxId, sourceUserId) —
        // and a targeted clause would let the second one abort the whole batch.
        const insertedInboxes = await tx
          .insert(contactInboxModel)
          .values(contactInboxRows)
          .onConflictDoNothing()
          .returning({
            id: contactInboxModel.id,
            sourceId: contactInboxModel.sourceId,
            contactId: contactInboxModel.contactId,
          })

        const insertedSourceIds = new Set(
          insertedInboxes.map((r) => r.sourceId),
        )

        // Race recovery — any acceptedNew sourceId not inserted lost to a
        // concurrent insert; re-SELECT winners + delete pre-allocated orphans.
        const racedSourceIds = acceptedNew
          .map(([sourceId]) => sourceId)
          .filter((s) => !insertedSourceIds.has(s))

        // Maps a raced entry's import key to the winner row that claimed its
        // scoped user id under a DIFFERENT sourceId — the final link mapping is
        // keyed by row.sourceId, so these aliases are re-keyed at the end.
        let scopedWinnerAliases = new Map<string, ContactInboxIdentityRow>()

        if (racedSourceIds.length > 0) {
          const winners = await tx
            .select({
              id: contactInboxModel.id,
              sourceId: contactInboxModel.sourceId,
              contactId: contactInboxModel.contactId,
            })
            .from(contactInboxModel)
            .where(
              and(
                eq(contactInboxModel.inboxId, inboxId),
                inArray(contactInboxModel.sourceId, racedSourceIds),
              ),
            )
          for (const w of winners) {
            insertedInboxes.push(w)
            insertedSourceIds.add(w.sourceId)
          }

          // A raced row skipped on the scoped-user-id index has no winner under
          // its own sourceId — resolve it through the row owning that scoped id.
          scopedWinnerAliases = await resolveScopedIdRaceWinners({
            tx,
            inboxId,
            racedEntries: racedSourceIds.flatMap((sourceId) => {
              if (insertedSourceIds.has(sourceId)) {
                return []
              }
              const scopedId = dedup.get(sourceId)?.sourceUserId
              return scopedId ? [[sourceId, scopedId] as const] : []
            }),
          })
          for (const winner of scopedWinnerAliases.values()) {
            insertedInboxes.push({
              id: winner.id,
              sourceId: winner.sourceId,
              contactId: winner.contactId,
            })
          }

          const racedSet = new Set(racedSourceIds)
          const orphanIds: string[] = []
          for (let i = 0; i < acceptedNew.length; i++) {
            const sourceId = acceptedNew[i]?.[0]
            const contactId = contactRows[i]?.id
            if (sourceId && contactId && racedSet.has(sourceId)) {
              orphanIds.push(contactId)
            }
          }
          if (orphanIds.length > 0) {
            await tx
              .delete(contactModel)
              .where(inArray(contactModel.id, orphanIds))
          }
        }

        // Re-created contacts keep their history: cancel any pending message
        // cleanup recorded when contacts with these inbox identities were deleted.
        await messageCleanupService.cancelByInboxSource({
          inboxId,
          sourceIds: insertedInboxes.map((r) => r.sourceId),
          tx,
        })

        const trulyNew = acceptedNew.length - racedSourceIds.length
        importedContacts = trulyNew

        const racedSet2 = new Set(racedSourceIds)
        const conversationsToInsert = conversationRows.filter(
          (_row, i) => !racedSet2.has(acceptedNew[i]?.[0]),
        )
        if (conversationsToInsert.length > 0) {
          await tx
            .insert(conversationModel)
            .values(conversationsToInsert)
            .onConflictDoNothing()
        }

        // Resolve conversation ids for everything just inserted (or raced).
        const acceptedContactIds = insertedInboxes.map((r) => r.contactId)
        const newConversations = await tx
          .select({
            id: conversationModel.id,
            contactId: conversationModel.contactId,
          })
          .from(conversationModel)
          .where(inArray(conversationModel.contactId, acceptedContactIds))
        const convByContactNew = new Map(
          newConversations.map((c) => [c.contactId, c.id]),
        )

        for (const inboxRow of insertedInboxes) {
          const convId = convByContactNew.get(inboxRow.contactId)
          if (!convId) {
            continue
          }
          resolved.set(inboxRow.sourceId, {
            contactInboxId: inboxRow.id,
            contactId: inboxRow.contactId,
            conversationId: convId,
          })

          const entry = dedup.get(inboxRow.sourceId)
          if (entry) {
            newContactCreatedEvents.push({
              workspaceId,
              contactId: inboxRow.contactId,
              contactInboxId: inboxRow.id,
              sourceId: inboxRow.sourceId,
              firstName: entry.firstName,
              phoneNumber: entry.phoneNumber,
              email: entry.email,
              channel: inboxChannel,
              source: contactSources.enum.inboundMessage,
              createdAt: new Date(),
            })
          }
        }

        // Scoped-id winners resolve under their own sourceId above; alias the
        // raced entry's import key to the same link so downstream message
        // imports keyed by the entry's sourceId still find their contact.
        for (const [entrySourceId, winner] of scopedWinnerAliases) {
          const link = resolved.get(winner.sourceId)
          if (link) {
            resolved.set(entrySourceId, link)
          }
        }
      }

      for (const [sourceId, link] of resolved) {
        contactInboxIds.set(sourceId, link)
      }
    })

    return { importedContacts, contactInboxIds, newContactCreatedEvents }
  }

  /**
   * One-shot ContactInbox+Conversation resolution by `(inboxId, sourceId[])`
   * — moved from `messenger-sync.ts`'s inline `leftJoin` query. Keep the
   * `leftJoin` shape verbatim (a missing conversation yields `conversationId:
   * null`, filtered out by the caller).
   */
  async listContactLinksBySourceIds(props: {
    inboxId: string
    sourceIds: string[]
  }): Promise<
    Array<{
      sourceId: string
      contactInboxId: string
      contactId: string
      conversationId: string | null
    }>
  > {
    const { inboxId, sourceIds } = props
    if (sourceIds.length === 0) {
      return []
    }
    const rows = await db
      .select({
        sourceId: contactInboxModel.sourceId,
        contactInboxId: contactInboxModel.id,
        contactId: contactInboxModel.contactId,
        conversationId: conversationModel.id,
      })
      .from(contactInboxModel)
      .leftJoin(
        conversationModel,
        eq(conversationModel.contactId, contactInboxModel.contactId),
      )
      .where(
        and(
          eq(contactInboxModel.inboxId, inboxId),
          inArray(contactInboxModel.sourceId, sourceIds),
        ),
      )
    return rows.map((row) => ({
      sourceId: row.sourceId ?? "",
      contactInboxId: row.contactInboxId,
      contactId: row.contactId,
      conversationId: row.conversationId,
    }))
  }
}

export const coexistImportService = new CoexistImportService()
