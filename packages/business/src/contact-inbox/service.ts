import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { contactInboxModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

export type ContactInboxWithAnalytics = Pick<
  ContactInboxModel,
  "id" | "contactId" | "sourceId" | "channel"
> & {
  contact: Pick<
    ContactModel,
    "id" | "firstName" | "lastName" | "fullName" | "avatar"
  >
  conversation: Pick<ConversationModel, "id"> | null
}

type FindByProps = {
  id: string
  contactId: string
  inboxId: string
  channel: string
}

class ContactInboxService extends BaseService {
  protected readonly cachePrefix: string = "contact-inboxes"

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, where } = props

    return await tx.query.contactInboxModel.findFirst({
      where,
    })
  }

  /**
   * The most recently active contact inbox for an inbox + source (e.g. a
   * webchat guest). Ordered by `lastMessageAt` desc so that when a guest has
   * reconnected and produced duplicate rows for the same `sourceId`, the live
   * one wins. Uncached: callers (e.g. the webchat message action) gate
   * new-contact creation on this read and must not see a stale miss.
   */
  async findLatestBySource(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceId: string
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, inboxId, sourceId } = props
    return await tx.query.contactInboxModel.findFirst({
      where: { inboxId, sourceId },
      orderBy: { lastMessageAt: "desc" },
    })
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
    ttlInSeconds?: number
  }): Promise<ContactInboxModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        ttl: props.ttlInSeconds,
        dynamicTags: (result) =>
          result ? [`tags:contacts:${result.contactId}`] : undefined,
      },
    )
  }

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<ContactInboxModel[]> {
    const { tx = db, contactId } = props
    const cacheKey = `contacts:${contactId}:contact-inboxes`

    return await withCache(
      cacheKey,
      async () =>
        await tx.query.contactInboxModel.findMany({
          where: {
            contactId,
          },
          orderBy: {
            id: "asc",
          },
        }),
      {
        tags: [`contacts:${contactId}:contact-inboxes`],
      },
    )
  }

  /**
   * Of the given candidate source ids, the subset already linked to this inbox.
   * Used by the contact import to dedup rows that already exist. Uncached: the
   * import gates inserts on this and must not see a stale miss. Accepts a `tx`
   * so the locked re-check can read within the same connection if needed.
   */
  async findExistingSourceIds(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceIds: string[]
  }): Promise<Set<string>> {
    const { tx = db, inboxId, sourceIds } = props
    if (sourceIds.length === 0) {
      return new Set()
    }
    const rows = await tx.query.contactInboxModel.findMany({
      where: { inboxId, sourceId: { in: sourceIds } },
      columns: { sourceId: true },
    })
    return new Set(rows.map((row) => row.sourceId))
  }

  async findManyByIds(ids: string[]): Promise<ContactInboxWithAnalytics[]> {
    return (await db.query.contactInboxModel.findMany({
      where: { id: { in: ids } },
      columns: { id: true, contactId: true, sourceId: true, channel: true },
      with: {
        contact: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            avatar: true,
          },
        },
        conversation: { columns: { id: true } },
      },
    })) as ContactInboxWithAnalytics[]
  }

  async findRecentByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<ContactInboxModel | undefined> {
    const allContactInboxes = await this.listByContactId(props)
    return allContactInboxes.sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    )[0]
  }

  async findLatestContactLastReadAtByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<Date | null> {
    const { tx = db, contactId } = props
    const contactInboxes = await tx.query.contactInboxModel.findMany({
      where: { contactId },
      columns: { contactLastReadAt: true },
    })

    return (
      contactInboxes
        .map((contactInbox) => contactInbox.contactLastReadAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    )
  }

  /**
   * Set (or clear) the channel persona for a contact-inbox connection. Used by
   * the "Set Persona" Messenger flow action; stores the local persona id (or
   * null to fall back to the page default). Invalidates the contact's
   * contact-inbox caches so the next send reads the new value.
   */
  async setPersona(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    personaId: string | null
  }): Promise<void> {
    const { tx = db, contactInboxId, contactId, personaId } = props

    await tx
      .update(contactInboxModel)
      .set({ personaId })
      .where(eq(contactInboxModel.id, contactInboxId))

    await this.invalidateCacheTags([
      `contacts:${contactId}:contact-inboxes`,
      `tags:contacts:${contactId}`,
    ])
  }

  async findLatestLastIncomingMessageAtByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<Date | null> {
    const { tx = db, contactId } = props
    const contactInboxes = await tx.query.contactInboxModel.findMany({
      where: { contactId },
      columns: { lastIncomingMessageAt: true },
    })

    return (
      contactInboxes
        .map((contactInbox) => contactInbox.lastIncomingMessageAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    )
  }
}

export const contactInboxService = new ContactInboxService()
