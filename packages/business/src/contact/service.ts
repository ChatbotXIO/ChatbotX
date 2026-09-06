import { macAnalyticsService } from "@chatbotx.io/analytics"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import {
  type ContactSource,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  buildContactWhere,
  type ContactFilterCriteriaInput,
  contactFilterHasPredicate,
} from "@chatbotx.io/database/queries"
import { contactRepository } from "@chatbotx.io/database/repositories"
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
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"
import { getContactInboxSinceTime } from "../contact-inbox/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { messageCleanupService } from "../message-cleanup/service"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { userQuotaService } from "../user-quota/service"
import { workspaceService } from "../workspace/service"
import { workspaceUsageService } from "../workspace-usage/service"
import { emitContactInfoChangeEvents } from "./contact-info-changes"
import { createContactWithInbox } from "./create-with-inbox"
import { PROFILE_NAME_BLANK_CHARACTERS } from "./profile-refresh/rules"
import { updateFieldsAndCustomFields } from "./update-fields"
import { parseContactIdentifier } from "./utils"

// One DELETE per chunk keeps each statement's lock scope and cascade work
// bounded (mirrors CONTACT_CHUNK_SIZE in tag/service.ts).
const CONTACT_DELETE_CHUNK_SIZE = 50

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
    | "locale"
    | "avatar"
    | "location"
  >
>

const richSystemContactFields = [
  "phone",
  "phone_number",
  "email",
  "full_name",
  "first_name",
  "last_name",
] as const

const NAME_PARTS_RE = /\s+/

export type RichSystemContactField = (typeof richSystemContactFields)[number]

export function isRichSystemContactField(
  fieldName: string,
): fieldName is RichSystemContactField {
  return richSystemContactFields.includes(fieldName as RichSystemContactField)
}

type ContactWithInboxes = ContactModel & { contactInboxes: ContactInboxModel[] }

export type ContactAccessScope = {
  restrictToAssignedUserId?: string
}

class ContactService extends BaseService {
  createWithInbox = createContactWithInbox
  updateFieldsAndCustomFields = updateFieldsAndCustomFields
  /**
   * Runs on every contact-addressed public request. Safe to cache: every
   * contact write path (update, delete, custom-field writes, tag writes)
   * invalidates `contacts:{id}`, and `withCache` never caches a negative
   * (undefined) result, so a not-yet-existing contact is never stuck
   * unresolvable.
   */
  async resolveIdByIdentifier(input: {
    workspaceId: string
    identifier: string
  }): Promise<string> {
    const { where } = parseContactIdentifier(input.identifier)
    const key = `contacts:${input.workspaceId}:identity:${input.identifier}`

    const id = await withCache(
      key,
      async () => {
        const contact = await contactRepository.findIdByIdentityWhere({
          workspaceId: input.workspaceId,
          ...where,
        })
        return contact?.id
      },
      {
        dynamicTags: (result) => (result ? [`contacts:${result}`] : undefined),
      },
    )

    if (!id) {
      throw notFoundException("Contact not found")
    }
    return id
  }
  async deleteAndRecord(ctx: {
    triggerSource: string
    workspaceId: string
    ids: string[]
    accessScope?: ContactAccessScope
  }): Promise<{ processedContactIds: string[]; skippedContactIds: string[] }> {
    const contacts = await contactService.delete(ctx)

    if (contacts.length > 0) {
      await dispatchAuditRecord({
        workspaceId: ctx.workspaceId,
        action: "delete",
        detail: `deleted contact${contacts.length > 1 ? "s" : ""} (${contacts.map((contact) => `#${contact.id}`).join(", ")})`,
      })
    }

    const occurredAt = new Date()
    for (const contact of contacts) {
      for (const contactInbox of contact.contactInboxes) {
        emit("analytics:dashboard", {
          eventType: "contact:deleted",
          workspaceId: ctx.workspaceId,
          contactId: contact.id,
          occurredAt,
          source: contactInbox.source,
          channel: contactInbox.channel,
          sourceId: contactInbox.sourceId,
          metadata: {
            triggerContext: {
              triggerSource: ctx.triggerSource,
              triggerHandler: "deleteContact",
              triggerType: "contact_deleted",
            },
          },
        })
      }
    }

    const processedSet = new Set(contacts.map((contact) => contact.id))
    return {
      processedContactIds: [...processedSet],
      skippedContactIds: ctx.ids.filter((id) => !processedSet.has(id)),
    }
  }

  async blockAndRecord(ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  }) {
    const contact = await contactService.block(ctx)

    emit("analytics:dashboard", {
      eventType: "contact:blocked",
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      occurredAt: contact.blockedAt ?? new Date(),
      country: contact.country,
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "blockContactAction",
          triggerType: "contact_blocked",
          origin: "manual",
        },
      },
    })
  }

  async unblockAndRecord(ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  }) {
    await contactService.unblock(ctx)
  }
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
    accessScope?: ContactAccessScope
    tx?: DatabaseClient
  }): Promise<ContactModel | undefined> {
    const { workspaceId, id, accessScope, tx = db } = props
    return await tx.query.contactModel.findFirst({
      where: withContactAccessScope({ id, workspaceId }, accessScope),
    })
  }

  async findByIdOrFail(props: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
    tx?: DatabaseClient
  }): Promise<ContactModel> {
    const contact = await this.findById(props)
    if (!contact) {
      throw notFoundException("Contact not found")
    }
    return contact
  }

  /**
   * The public-API "get full contact with relations" read — shared by
   * `get`/`create`/`upsert` in `contacts/api/public/crud.ts` so the
   * "findPublicById or 404" pair isn't repeated at each call site.
   */
  async findPublicContactOrFail(props: { workspaceId: string; id: string }) {
    const contact = await contactRepository.findPublicById(props)
    if (!contact) {
      throw notFoundException("Contact not found")
    }
    return contact
  }

  async matchesContactFilter(props: {
    workspaceId: string
    contactId: string
    contactFilter: ContactFilterCriteriaInput
  }): Promise<boolean> {
    const { workspaceId, contactId, contactFilter } = props
    if (
      contactFilter.conditions.length > 0 &&
      !contactFilterHasPredicate(contactFilter, workspaceId)
    ) {
      return false
    }

    const where = buildContactWhere({ workspaceId, contactFilter })
    const match = await db.query.contactModel.findFirst({
      columns: { id: true },
      where: { ...where, id: contactId },
    })

    return Boolean(match)
  }

  // ─── Reads (NO cache — write-path only) ─────────────────────────────────
  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    accessScope?: ContactAccessScope
    tx?: DatabaseClient
  }): Promise<{ id: string }[]> {
    const { workspaceId, ids, accessScope, tx = db } = props
    return await tx.query.contactModel.findMany({
      where: withContactAccessScope(
        { workspaceId, id: { in: ids } },
        accessScope,
      ),
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
    ctx: { workspaceId: string; id: string; accessScope?: ContactAccessScope },
    data: ContactWriteData,
    tx: DatabaseClient = db,
  ): Promise<ContactModel> {
    const ownsTransaction = tx === db
    const existing = await this.findByIdOrFail({
      workspaceId: ctx.workspaceId,
      id: ctx.id,
      accessScope: ctx.accessScope,
      tx,
    })
    const [updated] = await tx
      .update(contactModel)
      .set(data)
      .where(eq(contactModel.id, ctx.id))
      .returning()
    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [ctx.id] })
    if (ownsTransaction) {
      await emitContactInfoChangeEvents(
        ctx.workspaceId,
        ctx.id,
        existing,
        updated,
      )
    }
    return updated
  }

  /**
   * Conditional write closing the TOCTOU race a plain read-then-`update`
   * leaves open: checking `hasEmptyProfileName` and then calling `update`
   * has a window between the two where a concurrent write (an operator
   * edit, or another refresh attempt) can fill the name and get silently
   * overwritten. This folds the "both firstName and lastName are still
   * empty" predicate into the UPDATE's own WHERE clause — matching
   * `hasEmptyProfileName`'s semantics exactly (NULL or whitespace-only
   * counts as empty) — so the write only lands if the row still qualifies
   * at the instant of the write. Returns `undefined` when zero rows matched
   * (the name was filled concurrently) instead of throwing, so callers can
   * distinguish "raced, skip" from "wrote".
   *
   * `accessScope` authorization is handled the same way `update()` handles
   * it: via the `findByIdOrFail` read below, which throws if the contact is
   * outside the caller's scope. Unlike the name predicate, accessScope has
   * no race to close here, so it is not folded into the WHERE.
   */
  async updateIfProfileNameEmpty(
    ctx: { workspaceId: string; id: string; accessScope?: ContactAccessScope },
    data: ContactWriteData,
    tx: DatabaseClient = db,
  ): Promise<ContactModel | undefined> {
    const ownsTransaction = tx === db
    const existing = await this.findByIdOrFail({
      workspaceId: ctx.workspaceId,
      id: ctx.id,
      accessScope: ctx.accessScope,
      tx,
    })

    const [updated] = await tx
      .update(contactModel)
      .set(data)
      .where(
        and(
          eq(contactModel.id, ctx.id),
          eq(contactModel.workspaceId, ctx.workspaceId),
          sql`btrim(coalesce(${contactModel.firstName}, ''), ${PROFILE_NAME_BLANK_CHARACTERS}) = ''`,
          sql`btrim(coalesce(${contactModel.lastName}, ''), ${PROFILE_NAME_BLANK_CHARACTERS}) = ''`,
        ),
      )
      .returning()

    if (!updated) {
      return
    }

    await this.invalidate({ workspaceId: ctx.workspaceId, ids: [ctx.id] })
    if (ownsTransaction) {
      await emitContactInfoChangeEvents(
        ctx.workspaceId,
        ctx.id,
        existing,
        updated,
      )
    }
    return updated
  }

  async block(ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  }): Promise<ContactModel> {
    return await this.update(ctx, { blockedAt: new Date() })
  }

  async unblock(ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
  }): Promise<ContactModel> {
    return await this.update(ctx, { blockedAt: null })
  }

  async setRichSystemFieldByKey(input: {
    workspaceId: string
    contactId: string
    fieldName: RichSystemContactField
    value: string
    tx?: DatabaseClient
  }): Promise<ContactModel> {
    const { workspaceId, contactId, fieldName, value, tx = db } = input
    return await this.update(
      { workspaceId, id: contactId },
      richSystemFieldToContactData(fieldName, value),
      tx,
    )
  }

  async unsetRichSystemFieldByKey(input: {
    workspaceId: string
    contactId: string
    fieldName: RichSystemContactField
    tx?: DatabaseClient
  }): Promise<ContactModel> {
    const { workspaceId, contactId, fieldName, tx = db } = input
    return await this.update(
      { workspaceId, id: contactId },
      richSystemFieldToContactData(fieldName, null),
      tx,
    )
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
    accessScope?: ContactAccessScope
  }): Promise<ContactWithInboxes[]> {
    const { workspaceId, ids, accessScope } = props
    const contacts = await db.query.contactModel.findMany({
      where: withContactAccessScope(
        { workspaceId, id: { in: ids } },
        accessScope,
      ),
      with: { contactInboxes: true },
    })

    if (contacts.length === 0) {
      return []
    }

    // Fetched directly (not via the `conversation` "one" relation) because a
    // contact can own multiple Conversation rows.
    const conversations = await db
      .select({
        id: conversationModel.id,
        contactId: conversationModel.contactId,
      })
      .from(conversationModel)
      .where(
        inArray(
          conversationModel.contactId,
          contacts.map((c) => c.id),
        ),
      )
    const conversationIdsByContact = new Map<string, string[]>()
    for (const conversation of conversations) {
      const list = conversationIdsByContact.get(conversation.contactId) ?? []
      list.push(conversation.id)
      conversationIdsByContact.set(conversation.contactId, list)
    }

    // Message/Attachment no longer cascade from Contact (compressed TimescaleDB
    // hypertables), so each chunk atomically records tombstones in
    // MessageCleanup before deleting the contacts. Chunks are deliberately NOT
    // wrapped in one outer transaction: each chunk stays bounded, and a
    // mid-batch failure leaves every committed chunk with its tombstones.
    for (let i = 0; i < contacts.length; i += CONTACT_DELETE_CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CONTACT_DELETE_CHUNK_SIZE)
      const entries = chunk.flatMap((contact) =>
        contact.contactInboxes.map((contactInbox) => ({
          contactId: contact.id,
          contactInboxId: contactInbox.id,
          inboxId: contactInbox.inboxId,
          sourceId: contactInbox.sourceId,
          conversationIds: conversationIdsByContact.get(contact.id) ?? [],
          sinceTime: getContactInboxSinceTime(contactInbox),
        })),
      )

      await db.transaction(async (tx) => {
        await messageCleanupService.record({ workspaceId, entries, tx })
        await tx.delete(contactModel).where(
          inArray(
            contactModel.id,
            chunk.map((c) => c.id),
          ),
        )
      })
    }

    await this.invalidate({
      workspaceId,
      ids: contacts.map((c) => c.id),
    })

    await this.releaseQuotaForDeletedContacts({ workspaceId, contacts })

    return contacts
  }

  /**
   * Best-effort quota release for contacts just deleted. `contacts` is
   * released for every deleted contact; `mac` is released only for a contact
   * that has a `ContactActiveMonthly` row for the CURRENT billing period —
   * releasing `mac` for a contact that was never MAC-active this period would
   * over-release the pool. Never blocks/rolls back the delete: the nightly
   * reconcile self-heals if this fails.
   */
  private async releaseQuotaForDeletedContacts(props: {
    workspaceId: string
    contacts: ContactWithInboxes[]
  }): Promise<void> {
    const { workspaceId, contacts } = props
    try {
      const workspace = await workspaceService.find({
        where: { id: workspaceId },
      })
      if (!workspace) {
        return
      }

      const quota = await userQuotaService.getForUser(workspace.ownerId)
      const periodStart = quota?.periodStart ?? null

      let macActiveContactCount = 0
      if (periodStart) {
        const contactInboxIds = contacts.flatMap((contact) =>
          contact.contactInboxes.map((contactInbox) => contactInbox.id),
        )
        const activeContactInboxIds =
          await macAnalyticsService.getActiveContactInboxIds({
            workspaceId,
            periodStart,
            contactInboxIds,
          })
        macActiveContactCount = contacts.filter((contact) =>
          contact.contactInboxes.some((contactInbox) =>
            activeContactInboxIds.has(contactInbox.id),
          ),
        ).length
      }

      await quotaEnforcementService.releaseBy({
        userId: workspace.ownerId,
        metric: "contacts",
        count: contacts.length,
      })
      // Display-only breakdown, mirroring the `contacts`/`mac` release above.
      // Never let a failure here affect the authoritative counters.
      await workspaceUsageService
        .decrement(workspaceId, "contacts", contacts.length)
        .catch((usageErr) => {
          logger.warn(
            { err: usageErr, workspaceId },
            "contact delete: workspace usage contacts decrement failed",
          )
        })

      if (macActiveContactCount > 0) {
        await quotaEnforcementService.releaseBy({
          userId: workspace.ownerId,
          metric: "mac",
          count: macActiveContactCount,
        })
        await workspaceUsageService
          .decrement(workspaceId, "mac", macActiveContactCount)
          .catch((usageErr) => {
            logger.warn(
              { err: usageErr, workspaceId },
              "contact delete: workspace usage mac decrement failed",
            )
          })
      }
    } catch (err) {
      logger.warn({ err, workspaceId }, "contact delete: quota release failed")
    }
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
    source: ContactSource
    avatar?: string
  }): Promise<{ contact: ContactModel; isNew: boolean }> {
    const { workspaceId, identifier, data, source, avatar } = props

    const { prefix, value, where } = parseContactIdentifier(identifier)
    const whereClause = { workspaceId, ...where }

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

    // This is a passive upsert (no message activity): it must not gate on or
    // consume MAC. Only the info-only `contacts` metric is bumped.
    const { contact, contactInbox } =
      await quotaEnforcementService.createContactWithoutMac({
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
              source,
              sourceId: createId(),
            })
            .returning()
          if (!newContactInbox) {
            throw new ChatbotXException("Contact inbox not found")
          }

          // No cancelByInboxSource here: this path mints a fresh random sourceId,
          // so it can never collide with a MessageCleanup tombstone.
          await tx.insert(conversationModel).values({
            workspaceId,
            contactId: newContact.id,
            id: createId(),
          })

          return { contact: newContact, contactInbox: newContactInbox }
        },
      })

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
      contactInbox.id,
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

function richSystemFieldToContactData(
  fieldName: RichSystemContactField,
  value: string | null,
): ContactWriteData {
  switch (fieldName) {
    case "phone":
    case "phone_number":
      return { phoneNumber: value }
    case "email":
      return { email: value }
    case "first_name":
      return { firstName: value }
    case "last_name":
      return { lastName: value }
    case "full_name": {
      if (value === null) {
        return { firstName: null, lastName: null }
      }
      const [firstName, ...rest] = value.trim().split(NAME_PARTS_RE)
      return {
        firstName: firstName || null,
        lastName: rest.length > 0 ? rest.join(" ") : null,
      }
    }
    default:
      return {}
  }
}

function withContactAccessScope<TWhere extends Record<string, unknown>>(
  where: TWhere,
  accessScope?: ContactAccessScope,
) {
  if (!accessScope?.restrictToAssignedUserId) {
    return where
  }

  const conversation =
    typeof where.conversation === "object" &&
    where.conversation !== null &&
    !Array.isArray(where.conversation)
      ? where.conversation
      : {}

  return {
    ...where,
    conversation: {
      ...conversation,
      assignedUserId: accessScope.restrictToAssignedUserId,
    },
  }
}

export const contactService = new ContactService()
