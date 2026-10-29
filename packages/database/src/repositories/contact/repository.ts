import {
  and,
  countWithRelationsFilter,
  countWithRelationsFilterCapped,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  sql,
} from "../../client"
import { buildContactFilterMatchSQL } from "../../queries"
import type { ContactFilterCriteriaInput } from "../../queries/contact-filter/types"
import { contactModel } from "../../schema"
import type { ContactCustomFieldModel, ContactModel } from "../../types"
import { buildContactListWhere, resolveContactOrderBy } from "./list-where"

/** What a contact-export page loads besides the contact row itself. */
export type ContactExportRelations = {
  customFieldIds: string[]
  tagIds: string[]
  contactInboxes: "none" | "earliest" | "all"
}

/** A contact-export row; a relation is absent when no column needs it. */
export type ContactExportRow = ContactModel & {
  contactCustomFields?: Pick<
    ContactCustomFieldModel,
    "customFieldId" | "value"
  >[]
  tags?: { id: string }[]
  contactInboxes?: { sourceId: string; sourceUserId: string | null }[]
}

type ContactListInput = {
  where: Record<string, unknown>
  limit: number
  offset: number
  orderBy: Record<string, unknown>
}

const PUBLIC_CONTACT_RELATIONS = {
  tags: true,
  contactCustomFields: true,
  contactInboxes: { with: { inbox: true } },
  conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
} as const

export const contactRepository = {
  buildListWhere: buildContactListWhere,
  resolveOrderBy: resolveContactOrderBy,
  findIdByIdentityWhere(
    input: {
      workspaceId: string
      id?: string
      email?: string
      phoneNumber?: string
    },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactModel
      .findFirst({ where: input, columns: { id: true } })
      .then((contact) => contact ?? null)
  },
  findPublicById(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactModel.findFirst({
      where: input,
      with: PUBLIC_CONTACT_RELATIONS,
    })
  },
  // Back-compat for the deprecated `contacts.findByCustomField` alias — use
  // `contacts.list` with a `contactFilter` instead.
  async listPublicByCustomField(
    input: {
      where: Record<string, unknown>
      limit: number
      orderBy: Record<string, unknown>
    },
    tx: DatabaseClient = db,
  ) {
    const { where, limit, orderBy } = input
    const data = await tx.query.contactModel.findMany({
      where,
      limit,
      orderBy,
      with: PUBLIC_CONTACT_RELATIONS,
    })
    return { data }
  },
  listWithRelations(input: ContactListInput, tx: DatabaseClient = db) {
    return tx.query.contactModel.findMany({
      ...input,
      with: PUBLIC_CONTACT_RELATIONS,
    })
  },
  listWithInboxesAndConversation(
    input: ContactListInput,
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactModel.findMany({
      ...input,
      with: {
        contactInboxes: { with: { inbox: true } },
        conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
      },
    })
  },
  listTableRows(input: ContactListInput, tx: DatabaseClient = db) {
    return tx.query.contactModel.findMany({
      ...input,
      columns: {
        id: true,
        fullName: true,
        avatar: true,
        createdAt: true,
      },
      with: {
        contactInboxes: {
          columns: {
            channel: true,
            source: true,
            contactLastReadAt: true,
          },
        },
        conversation: {
          columns: { id: true },
          with: {
            assignedUser: {
              columns: { name: true, email: true },
            },
          },
        },
      },
    })
  },
  findDetailById(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactModel.findFirst({
      where: input,
      with: {
        tags: true,
        contactCustomFields: { with: { customField: true } },
        conversation: true,
      },
    })
  },
  count(input: { client?: DatabaseClient; where: Record<string, unknown> }) {
    return countWithRelationsFilter({
      ...input,
      table: contactModel,
      tsName: "contactModel",
    })
  },
  countCapped(input: {
    client?: DatabaseClient
    where: Record<string, unknown>
    cap: number
  }) {
    return countWithRelationsFilterCapped({
      ...input,
      table: contactModel,
      tsName: "contactModel",
    })
  },
  /**
   * The subset of `contactIds` (one scan page of at most a few thousand) that
   * match the filter. A PK probe per id plus the filter's own EXISTS probes, so
   * a broadcast audience scan costs O(audience) instead of re-running the
   * whole filter for every chunk.
   */
  async findIdsMatchingFilter(
    input: {
      workspaceId: string
      contactIds: string[]
      contactFilter: ContactFilterCriteriaInput
    },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.contactIds.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: contactModel.id })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, input.workspaceId),
          inArray(contactModel.id, input.contactIds),
          buildContactFilterMatchSQL({
            workspaceId: input.workspaceId,
            contactFilter: input.contactFilter,
          }),
        ),
      )
    return rows.map((row) => row.id)
  },
  async sumTotalContactsFromInboxStats(
    workspaceId: string,
    tx: DatabaseClient = db,
  ) {
    const inboxes = await tx.query.inboxModel.findMany({
      where: { workspaceId },
      with: { contactStats: true },
    })
    return inboxes.reduce(
      (total, inbox) => total + (inbox.contactStats?.totalContacts ?? 0),
      0,
    )
  },
  /**
   * Fill `Contact.phoneNumber` / `Contact.email` only when currently NULL —
   * moved VERBATIM from `bulk-historical-import.ts`'s contact-enrichment
   * transaction. The double-`::text` cast and the compound `WHERE` guard are
   * load-bearing; do not simplify.
   */
  async enrichIfNull(
    props: {
      contactId: string
      phoneNumber?: string
      email?: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { contactId, phoneNumber, email } = props
    await tx.transaction(async (innerTx) => {
      await innerTx.execute(sql`
        UPDATE "Contact" SET
          "phoneNumber" = COALESCE("phoneNumber", ${phoneNumber ?? null}::text),
          "email"       = COALESCE("email",       ${email ?? null}::text)
        WHERE "id" = ${contactId}
          AND (
            (${phoneNumber ?? null}::text IS NOT NULL AND "phoneNumber" IS NULL)
            OR (${email ?? null}::text IS NOT NULL AND "email" IS NULL)
          )
      `)
    })
  },
  /**
   * Move `Contact.createdAt` back to a known earlier time — one statement for
   * the whole batch. Backdate-only: Postgres LEAST never moves the column
   * forward, so replaying an overlapping coexist chunk is idempotent and a
   * genuinely older creation time is kept. Workspace-scoped in the WHERE so a
   * foreign contact id in the batch is a no-op rather than a cross-tenant write.
   *
   * Returns the ids whose `createdAt` actually moved. The `>` guard makes a
   * replayed or already-correct contact a zero-write, and surfacing that lets
   * the service skip cache invalidation for it.
   */
  async backdateCreatedAt(
    rows: { contactId: string; workspaceId: string; createdAt: Date }[],
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (rows.length === 0) {
      return []
    }
    const valueRows = rows.map(
      (row) => sql`(
        ${row.contactId}::int8,
        ${row.workspaceId}::int8,
        ${row.createdAt}::timestamptz
      )`,
    )
    const result = await tx.execute<{ id: string }>(sql`
      UPDATE "Contact" AS t
      SET "createdAt" = LEAST(t."createdAt", u.created_ts)
      FROM (VALUES ${sql.join(valueRows, sql`, `)}) AS u(id, workspace_id, created_ts)
      WHERE t."id" = u.id
        AND t."workspaceId" = u.workspace_id
        AND t."createdAt" > u.created_ts
      RETURNING t."id"
    `)
    return result.rows.map((row) => row.id)
  },
  /**
   * Atomically transition contacts to blocked, scoped to one workspace.
   *
   * The `isNull(blockedAt)` guard in the WHERE is load-bearing: callers use
   * the RETURNING set as the "really transitioned" list to decide which
   * analytics events to emit. A read-then-write would leave a TOCTOU window
   * that double-counts `contact_blocked`.
   */
  async blockManyIfNotBlocked(
    props: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<{ id: string }[]> {
    if (props.ids.length === 0) {
      return []
    }
    return await tx
      .update(contactModel)
      .set({ blockedAt: new Date() })
      .where(
        and(
          eq(contactModel.workspaceId, props.workspaceId),
          inArray(contactModel.id, props.ids),
          isNull(contactModel.blockedAt),
        ),
      )
      .returning({ id: contactModel.id })
  },
  /**
   * Contact-export keyset page (`apps/worker/src/default/handlers/export-
   * contacts.ts`). Loads only what the selected columns render: each relation
   * is skipped when no column needs it, and narrowed to the selected custom
   * fields and tags otherwise. `where` is untouched, so a filter on a tag or a
   * custom field still matches whatever columns are exported.
   */
  async listForExportPage(
    input: {
      where: Record<string, unknown>
      limit: number
      relations: ContactExportRelations
    },
    tx: DatabaseClient = db,
  ): Promise<ContactExportRow[]> {
    const { customFieldIds, tagIds, contactInboxes } = input.relations
    return await tx.query.contactModel.findMany({
      where: input.where,
      with: {
        ...(customFieldIds.length > 0 && {
          contactCustomFields: {
            columns: { customFieldId: true, value: true },
            where: { customFieldId: { in: customFieldIds } },
          },
        }),
        ...(tagIds.length > 0 && {
          tags: { columns: { id: true }, where: { id: { in: tagIds } } },
        }),
        // The Contact Id column needs only the earliest row's sourceId; the
        // WhatsApp User ID column scans every row for one with a sourceUserId.
        ...(contactInboxes !== "none" && {
          contactInboxes: {
            columns: { sourceId: true, sourceUserId: true },
            orderBy: { id: "asc" },
            ...(contactInboxes === "earliest" && { limit: 1 }),
          },
        }),
      },
      limit: input.limit,
      orderBy: { id: "asc" },
    })
  },
}
