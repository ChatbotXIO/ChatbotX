import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ContactNoteModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

class ContactNoteService extends BaseService {
  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<ContactNoteModel[]> {
    const { tx = db, contactId } = props

    return await withCache(
      `contacts:${contactId}:contact-notes`,
      async () =>
        await tx.query.contactNoteModel.findMany({
          where: { contactId },
          orderBy: { createdAt: "desc" },
        }),
      {
        tags: [`contacts:${contactId}`, `contacts:${contactId}:contact-notes`],
      },
    )
  }
}

export const contactNoteService = new ContactNoteService()
