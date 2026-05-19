import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ContactModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type FindByProps = {
  id: string
}

class ContactService extends BaseService {
  protected readonly cachePrefix: string = "contacts"

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ContactModel | undefined> {
    const { tx = db, where } = props
    const key = `contacts:${JSON.stringify(where)}`

    return await withCache(
      key,
      async () =>
        await tx.query.contactModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`contacts:${result.id}`]
          }
        },
      },
    )
  }
}

export const contactService = new ContactService()
