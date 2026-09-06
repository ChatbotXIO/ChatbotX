import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import type { ContactNoteModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
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

  /**
   * Insert a note from a flow step, with `createdById` deliberately unset
   * (no user attribution — matches the pre-refactor worker behavior). Do NOT
   * use this for a user-attributed create (that needs `workspaceId` +
   * `createdById`); a converged single creation path is a follow-up once
   * both branches exist.
   */
  async createFromFlow(props: {
    contactId: string
    text: string
    tx?: DatabaseClient
  }): Promise<ContactNoteModel> {
    const { contactId, text, tx = db } = props
    const [note] = await tx
      .insert(contactNoteModel)
      .values({ id: createId(), contactId, text })
      .returning()
    await this.invalidateCacheTags([`contacts:${contactId}:contact-notes`])
    return note
  }
}

export const contactNoteService = new ContactNoteService()
