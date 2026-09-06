import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
} from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import type { ContactNoteModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact/service"

class ContactNoteService extends BaseService {
  async create(input: {
    workspaceId: string
    contactId: string
    text: string
    createdById: string | null
    accessScope?: ContactAccessScope
  }) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
    const [note] = await db
      .insert(contactNoteModel)
      .values({
        id: createId(),
        contactId: input.contactId,
        text: input.text,
        createdById: input.createdById,
      })
      .returning()
    await this.invalidateCacheTags([
      `contacts:${input.contactId}:contact-notes`,
    ])
    return note
  }
  async update(input: {
    workspaceId: string
    contactId: string
    noteId: string
    text?: string
    accessScope?: ContactAccessScope
  }) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
    await findOrFail({
      table: contactNoteModel,
      where: { contactId: input.contactId, id: input.noteId },
      message: "Contact note not found",
    })
    const [note] = await db
      .update(contactNoteModel)
      .set({ text: input.text })
      .where(
        and(
          eq(contactNoteModel.id, input.noteId),
          eq(contactNoteModel.contactId, input.contactId),
        ),
      )
      .returning()
    await this.invalidateCacheTags([
      `contacts:${input.contactId}:contact-notes`,
    ])
    return note
  }
  async delete(input: {
    workspaceId: string
    contactId: string
    noteId: string
    accessScope?: ContactAccessScope
  }) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
    await db
      .delete(contactNoteModel)
      .where(
        and(
          eq(contactNoteModel.id, input.noteId),
          eq(contactNoteModel.contactId, input.contactId),
        ),
      )
    await this.invalidateCacheTags([
      `contacts:${input.contactId}:contact-notes`,
    ])
  }
  listWithAuthor(input: { contactId: string }) {
    return db.query.contactNoteModel.findMany({
      where: { contactId: input.contactId, createdById: { isNotNull: true } },
      with: { createdBy: true },
    })
  }
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
