import {
  countWithRelationsFilter,
  countWithRelationsFilterCapped,
  type DatabaseClient,
  db,
} from "../../client"
import { contactModel } from "../../schema"

type ContactListInput = {
  where: Record<string, unknown>
  limit: number
  offset: number
  orderBy: Record<string, unknown>
}

export const contactRepository = {
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
      with: {
        tags: true,
        contactCustomFields: true,
        contactInboxes: { with: { inbox: true } },
        conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
      },
    })
  },
  async listPublicByCustomField(
    input: { workspaceId: string; customFieldId: string; value: string },
    tx: DatabaseClient = db,
  ) {
    const { workspaceId, customFieldId, value } = input
    const where: Record<string, unknown> = { workspaceId }
    if (customFieldId === "email") {
      where.email = value
    } else if (customFieldId === "phone") {
      where.phoneNumber = value
    } else {
      where.contactCustomFields = { customFieldId, value }
    }
    const data = await tx.query.contactModel.findMany({
      where,
      limit: 100,
      orderBy: { updatedAt: "desc" },
      with: {
        tags: true,
        contactCustomFields: true,
        contactInboxes: { with: { inbox: true } },
        conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
      },
    })
    return { data }
  },
  listWithRelations(input: ContactListInput, tx: DatabaseClient = db) {
    return tx.query.contactModel.findMany({
      ...input,
      with: {
        tags: true,
        contactCustomFields: true,
        contactInboxes: { with: { inbox: true } },
        conversation: { with: { assignedUser: true, assignedInboxTeam: true } },
      },
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
}
