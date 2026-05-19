import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

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
}

export const contactInboxService = new ContactInboxService()
