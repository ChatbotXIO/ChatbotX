import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type { ContactModel } from "@chatbotx.io/database/types"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type FindByProps = {
  id: string
}

class ContactService extends BaseService {
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

  async unsubscribeEmail(cid: string) {
    await db
      .update(contactModel)
      .set({ emailOptIn: false })
      .where(eq(contactModel.id, cid))
    await invalidateCacheByTags([`contacts:${cid}`])
  }
}

export const contactService = new ContactService()
