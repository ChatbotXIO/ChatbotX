import {
  countWithRelationsFilter,
  countWithRelationsFilterCapped,
  type DatabaseClient,
  db,
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
}
