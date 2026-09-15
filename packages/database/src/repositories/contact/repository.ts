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
import { contactModel } from "../../schema"
import { buildContactListWhere, resolveContactOrderBy } from "./list-where"

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
  listForTable(input: ContactListInput, tx: DatabaseClient = db) {
    return tx.query.contactModel.findMany({
      ...input,
      with: {
        contactInboxes: { with: { inbox: true } },
        conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
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
        contactNotes: true,
        contactsOnSequences: { with: { sequence: true } },
        conversation: true,
      },
    })
  },
  count(input: { where: Record<string, unknown> }) {
    return countWithRelationsFilter({
      ...input,
      table: contactModel,
      tsName: "contactModel",
    })
  },
  countCapped(input: { where: Record<string, unknown>; cap: number }) {
    return countWithRelationsFilterCapped({
      ...input,
      table: contactModel,
      tsName: "contactModel",
    })
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
   * contacts.ts`). The `with` literal lives here so Drizzle keeps type
   * inference for the relational query; the handler keeps `chunkById` and its
   * own `fetchContactPage` wrapper around this call.
   */
  async listForExportPage(
    input: {
      where: Record<string, unknown>
      limit: number
      includeSourceUserId: boolean
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.contactModel.findMany({
      where: input.where,
      with: {
        contactCustomFields: true,
        tags: true,
        // The Contact Id column only needs the earliest row's sourceId. The
        // WhatsApp User ID column must scan every inbox connection for the
        // row that actually carries a sourceUserId, so the earliest-row
        // limit is lifted ONLY when that column is selected — ordinary
        // exports keep the single-row load.
        contactInboxes: {
          columns: { sourceId: true, sourceUserId: true },
          orderBy: { id: "asc" },
          ...(input.includeSourceUserId ? {} : { limit: 1 }),
        },
      },
      limit: input.limit,
      orderBy: { id: "asc" },
    })
  },
}

export type ContactExportPageRow = Awaited<
  ReturnType<typeof contactRepository.listForExportPage>
>[number]
