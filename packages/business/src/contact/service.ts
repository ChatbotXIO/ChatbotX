import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import { channelTypes, contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"

const NUMERIC_RE = /^\d+$/

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
    | "avatar"
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
    // return await withCache(
    //   `contacts:${workspaceId}:${id}`,
    //   async () =>
    return await tx.query.contactModel.findFirst({
      where: { id, workspaceId },
    })
    // {
    //   dynamicTags: (result) =>
    //     result
    //       ? ["contacts", `contacts:${workspaceId}`, `contacts:${result.id}`]
    //       : undefined,
    // },
    // )
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

  async unblockIfBlocked(
    ctx: { workspaceId: string; id: string },
    contact?: ContactModel | null,
  ): Promise<ContactModel | null> {
    const current = contact ?? (await this.findById(ctx))
    if (!current?.blockedAt) {
      return null
    }
    return await this.unblock(ctx)
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

  async upsertByIdentifier(props: {
    workspaceId: string
    identifier: string
    data: Omit<ContactWriteData, "blockedAt" | "emailOptIn">
    avatar?: string
  }): Promise<{ contact: ContactModel; isNew: boolean }> {
    const { workspaceId, identifier, data, avatar } = props

    const colonIdx = identifier.indexOf(":")
    if (colonIdx === -1) {
      throw notFoundException("Invalid identifier format")
    }

    const prefix = identifier.slice(0, colonIdx)
    const value = identifier.slice(colonIdx + 1)
    if (!value) {
      throw notFoundException("Invalid identifier format")
    }

    const whereClause: Record<string, unknown> = { workspaceId }
    if (prefix === "id") {
      if (!NUMERIC_RE.test(value)) {
        throw notFoundException("Contact not found")
      }
      whereClause.id = value
    } else if (prefix === "email") {
      whereClause.email = value
    } else if (prefix === "phone") {
      whereClause.phoneNumber = value
    } else {
      throw notFoundException(
        "Invalid identifier format. Use id:, email:, or phone: prefix",
      )
    }

    const existing = await db.query.contactModel.findFirst({
      where: whereClause,
      columns: { id: true },
    })

    if (existing) {
      const avatarPath = avatar
        ? await this.resolveAvatarPath(avatar, workspaceId, existing.id)
        : undefined
      const contact = await this.update(
        { workspaceId, id: existing.id },
        { ...data, ...(avatarPath !== undefined && { avatar: avatarPath }) },
      )
      return { contact, isNew: false }
    }

    if (prefix === "id") {
      throw notFoundException("Contact not found")
    }

    const phoneNumber =
      data.phoneNumber ?? (prefix === "phone" ? value : undefined)
    if (phoneNumber) {
      const phoneConflict = await db.query.contactModel.findFirst({
        where: { workspaceId, phoneNumber },
        columns: { id: true },
      })
      if (phoneConflict) {
        throw new ChatbotXException(
          "Phone number already exists",
          "phoneExists",
          422,
        )
      }
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw notFoundException("Workspace not found")
    }

    const inbox = await findOrFail({
      table: inboxModel,
      where: { workspaceId, channel: channelTypes.enum.webchat },
      message: "Inbox not found",
    })

    const identifierData =
      prefix === "phone" ? { phoneNumber: value } : { email: value }

    // MAC is the billing hard gate: gate + insert + consume run atomically so a
    // new contact is rejected (and nothing inserted) once the limit is reached.
    // The `ContactActiveMonthly` presence row written in the transaction keeps a
    // later message event from double-counting; `contacts` stays info-only.
    const result = await quotaEnforcementService.createNewContactWithMac({
      ownerId: workspace.ownerId,
      workspaceId,
      create: async (tx) => {
        const newContact = await this.insert({
          workspaceId,
          data: { ...identifierData, ...data },
          tx,
        })

        const [newContactInbox] = await tx
          .insert(contactInboxModel)
          .values({
            originalContactId: newContact.id,
            contactId: newContact.id,
            inboxId: inbox.id,
            channel: channelTypes.enum.webchat,
            source: contactSources.enum.imported,
            sourceId: createId(),
          })
          .returning()
        if (!newContactInbox) {
          throw new ChatbotXException("Contact inbox not found")
        }

        await tx.insert(conversationModel).values({
          workspaceId,
          contactId: newContact.id,
          id: createId(),
        })

        return {
          value: { contact: newContact, contactInbox: newContactInbox },
          contactId: newContact.id,
          contactInboxId: newContactInbox.id,
          inboxId: inbox.id,
        }
      },
    })

    if (!result.ok) {
      throw new ChatbotXException("Contact limit reached", "quotaExceeded", 422)
    }

    const { contact, contactInbox } = result.value

    if (avatar) {
      const avatarPath = await this.resolveAvatarPath(
        avatar,
        workspaceId,
        contact.id,
      )
      await this.update({ workspaceId, id: contact.id }, { avatar: avatarPath })
    }

    await emitContactCreated(
      workspaceId,
      contact.id,
      contact.firstName || undefined,
      contact.phoneNumber || undefined,
      contact.email || undefined,
    )

    emit("analytics:dashboard", {
      eventType: "contact:created",
      workspaceId,
      contactId: contactInbox.id,
      occurredAt: contact.createdAt,
      source: contactInbox.source,
      sourceId: contactInbox.sourceId,
      channel: inbox.channel,
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "upsertContact",
          triggerType: "contact_created",
        },
      },
    })

    return { contact, isNew: true }
  }

  private async resolveAvatarPath(
    avatar: string,
    workspaceId: string,
    contactId: string,
  ): Promise<string> {
    if (!avatar.startsWith("http")) {
      return avatar
    }
    const uploaded = await uploadFileFromUrl(
      avatar,
      `public/space/${workspaceId}/contacts/${contactId}/avatar/${createId()}`,
    )
    return uploaded.originPath
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
