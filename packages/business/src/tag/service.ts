import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { TagModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

class TagService extends BaseService {
  protected readonly cachePrefix: string = "tags"

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<TagModel[]> {
    const { tx = db, contactId } = props
    const key = `contacts:${contactId}:tags`

    return await withCache(
      key,
      async () =>
        await tx.query.tagModel.findMany({
          where: { contactsToTags: { contactId } },
          orderBy: { name: "asc" },
        }),
      {
        tags: [`contacts:${contactId}`],
      },
    )
  }
}

export const tagService = new TagService()
