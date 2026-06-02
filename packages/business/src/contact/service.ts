import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

type ContactWriteData = Partial<
  Pick<
    ContactModel,
    | "firstName"
    | "lastName"
    | "email"
    | "phoneNumber"
    | "gender"
    | "country"
    | "city"
    | "blockedAt"
    | "emailOptIn"
    | "timezone"
  >
>

type ContactWithInboxes = ContactModel & { contactInboxes: ContactInboxModel[] }

class ContactService extends BaseService {
  // ─── Legacy generic find (preserved for backward compat) ────────────────
  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<{ id: string }>
  }): Promise<ContactModel | undefined> {
    const { tx = db, where } = props
    const key = `contacts:${JSON.stringify(where)}`

    return await withCache(
      key,
      async () => await tx.query.contactModel.findFirst({ where }),
      {
        dynamicTags: (result) =>
          result ? [`contacts:${result.id}`] : undefined,
      },
    )
  }

  // ─── Reads (cached) ──────────────────────────────────────────────────────
  async findById(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<ContactModel | undefined> {
    const { workspaceId, id, tx = db } = props
    return await withCache(
      `contacts:${workspaceId}:${id}`,
      async () =>
        await tx.query.contactModel.findFirst({
          where: { id, workspaceId },
        }),
      {
        dynamicTags: (result) =>
          result
            ? ["contacts", `contacts:${workspaceId}`, `contacts:${result.id}`]
            : undefined,
      },
    )
  }

  async findByIdOrFail(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<ContactModel> {
    const contact = await this.findById(props)
    if (!contact) {
      throw notFoundException("Contact not found")
    }
    return contact
  }

  // ─── Reads (NO cache — write-path only) ─────────────────────────────────
  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string }[]> {
    const { workspaceId, ids, tx = db } = props
    return await tx.query.contactModel.findMany({
      where: { workspaceId, id: { in: ids } },
      columns: { id: true },
    })
  }

  async findByPhone(props: {
    workspaceId: string
    phoneNumber: string
  }): Promise<ContactModel | undefined> {
    return await db.query.contactModel.findFirst({
      where: { workspaceId: props.workspaceId, phoneNumber: props.phoneNumber },
    })
  }

  // ─── Writes ──────────────────────────────────────────────────────────────
  async insert(props: {
    workspaceId: string
    data: Omit<ContactWriteData, "blockedAt" | "emailOptIn"> &
      Record<string, unknown>
    tx?: DatabaseClient
  }): Promise<ContactModel> {
    const { workspaceId, data, tx = db } = props
    const [contact] = await tx
      .insert(contactModel)
      .values({ id: createId(), workspaceId, ...data })
      .returning()
    await this.invalidate({ workspaceId })
    return contact
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: ContactWriteData,
    tx: DatabaseClient = db,
  ): Promise<ContactModel> {
    await this.findByIdOrFail({ workspaceId: ctx.workspaceId, id: ctx.id, tx })
    const [updated] = await tx
      .update(contactModel)
      .set(data)
      .where(eq(contactModel.id, ctx.id))
      .returning()
    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [ctx.id] })
    return updated
  }

  async block(ctx: { workspaceId: string; id: string }): Promise<ContactModel> {
    return await this.update(ctx, { blockedAt: new Date() })
  }

  async unblock(ctx: {
    workspaceId: string
    id: string
  }): Promise<ContactModel> {
    return await this.update(ctx, { blockedAt: null })
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
  }): Promise<ContactWithInboxes[]> {
    const { workspaceId, ids } = props
    const contacts = await db.query.contactModel.findMany({
      where: { workspaceId, id: { in: ids } },
      with: { contactInboxes: true },
    })

    if (contacts.length === 0) {
      return []
    }

    await db.delete(contactModel).where(
      and(
        inArray(
          contactModel.id,
          contacts.map((c) => c.id),
        ),
      ),
    )

    await this.invalidate({
      workspaceId,
      ids: contacts.map((c) => c.id),
    })

    return contacts
  }

  // ─── Cache ───────────────────────────────────────────────────────────────
  async invalidate(props: {
    workspaceId: string
    ids?: string[]
  }): Promise<void> {
    const tags = [
      "contacts",
      `contacts:${props.workspaceId}`,
      ...(props.ids?.map((id) => `contacts:${id}`) ?? []),
    ]
    await this.invalidateCacheTags(tags)
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
