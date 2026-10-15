import { findOrFail } from "@chatbotx.io/database/client"
import {
  type ChannelType,
  type ContactSource,
  channelTypes,
  contactSources,
} from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  conversationModel,
  inboxModel,
} from "@chatbotx.io/database/schema"
import type { ContactModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { contactInboxService } from "../contact-inbox/service"
import { ChatbotXException, validationException } from "../errors"
import { messageCleanupService } from "../message-cleanup/service"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"
import { resolveNewContactInboxSourceId } from "./contact-inbox-identity"
import { normalizePhoneToE164 } from "./phone"
import { contactService } from "./service"

type CreateContactInput = {
  phoneNumber?: string
  email: string
  contactId?: string
  firstName?: string
  lastName?: string
  gender: ContactModel["gender"]
  channel: ChannelType
  inboxId: string
}

/** Raised when `(inbox, sourceId)` already has a contact; callers racing to create may re-resolve it. */
export const CONTACT_ALREADY_ON_INBOX_MESSAGE =
  "This contact already exists on the selected inbox"

/**
 * `workspace` (default): a phone number may exist once per workspace — the
 * manual / public-API creation rule. `inbox`: identity is scoped to the inbox,
 * as it is for contacts created by an incoming message, so the same phone can
 * exist on different channels; the `(inbox, sourceId)` unique index still
 * guards duplicates within the inbox.
 */
export type ContactPhoneUniqueness = "workspace" | "inbox"

export const createContactWithInbox = async ({
  workspaceId,
  input: parsedInput,
  source = contactSources.enum.direct,
  phoneUniqueness = "workspace",
}: {
  workspaceId: string
  input: CreateContactInput
  source?: ContactSource
  phoneUniqueness?: ContactPhoneUniqueness
}) => {
  const inbox = await findOrFail({
    table: inboxModel,
    where: { workspaceId, id: parsedInput.inboxId },
    message: "Inbox not found",
  })
  const inboxChannel = inbox.channel as ChannelType

  if (parsedInput.channel !== inboxChannel) {
    throw validationException(
      "inboxId",
      "Selected inbox does not match the selected source",
    )
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    throw validationException("phoneNumber", "Workspace not found")
  }

  // Normalize any provided phone to E.164 (with country code) so it is stored and
  // deduped consistently across every channel — not just WhatsApp. WhatsApp always
  // needs one (it is the wa_id); other channels normalize only when a phone is given.
  let normalizedPhone = parsedInput.phoneNumber
  if (inboxChannel === channelTypes.enum.whatsapp || parsedInput.phoneNumber) {
    const e164Phone = normalizePhoneToE164(
      parsedInput.phoneNumber ?? "",
      workspace.targetCountry,
    )
    if (!e164Phone) {
      throw validationException(
        "phoneNumber",
        "Please include the country code (e.g. +84)",
      )
    }
    normalizedPhone = e164Phone
  }

  // Each channel keys its contacts on its own identity (WhatsApp: phone digits,
  // SMTP: email, webchat: minted, others: the channel user id).
  const sourceId = resolveNewContactInboxSourceId(inboxChannel, {
    channelUserId: parsedInput.contactId,
    phoneE164: normalizedPhone,
    email: parsedInput.email,
  })

  const existedContact =
    normalizedPhone && phoneUniqueness === "workspace"
      ? await contactService.findByPhone({
          workspaceId,
          phoneNumber: normalizedPhone,
        })
      : undefined
  if (existedContact) {
    throw validationException("phoneNumber", "Phone number is exists")
  }

  if (inboxChannel !== channelTypes.enum.webchat) {
    const existing = await contactInboxService.findLatestBySource({
      inboxId: inbox.id,
      sourceId,
      workspaceId,
    })
    if (existing) {
      let field = "contactId"
      if (inboxChannel === channelTypes.enum.whatsapp) {
        field = "phoneNumber"
      } else if (inboxChannel === channelTypes.enum.smtp) {
        field = "email"
      }
      throw validationException(field, CONTACT_ALREADY_ON_INBOX_MESSAGE)
    }
  }

  // Store the normalized WhatsApp phone, but keep other contact fields unchanged.
  const {
    channel: _channel,
    inboxId: _inboxId,
    contactId: _contactId,
    ...rest
  } = parsedInput
  const contactData = { ...rest, phoneNumber: normalizedPhone }

  const { contact, contactInbox } =
    await quotaEnforcementService.createContactWithoutMac({
      ownerId: workspace.ownerId,
      workspaceId,
      create: async (tx) => {
        const contact = await contactService.insert({
          workspaceId,
          data: contactData,
          tx,
        })

        const [contactInbox] = await tx
          .insert(contactInboxModel)
          .values({
            originalContactId: contact.id,
            contactId: contact.id,
            inboxId: inbox.id,
            channel: inboxChannel,
            source,
            sourceId,
          })
          .returning()
        if (!contactInbox) {
          throw new ChatbotXException("Contact inbox not found")
        }

        // A re-created contact keeps its history: cancel any pending message
        // cleanup recorded when a contact with this inbox identity was deleted.
        await messageCleanupService.cancelByInboxSource({
          inboxId: inbox.id,
          sourceIds: [contactInbox.sourceId],
          tx,
        })

        await tx.insert(conversationModel).values({
          workspaceId,
          contactId: contact.id,
          id: createId(),
        })

        return { contact, contactInbox }
      },
    })

  await dispatchAuditRecord({
    workspaceId,
    action: "create",
    detail: `created a new contact (#${contact.id})`,
  })

  await emitContactCreated(
    workspaceId,
    contact.id,
    contact.firstName || undefined,
    contact.phoneNumber || undefined,
    contact.email || undefined,
    contactInbox.id,
  )

  if (contactInbox.sourceId) {
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
          triggerHandler: "createContact",
          triggerType: "contact_created",
        },
      },
    })
  }

  return { contact, contactInbox }
}
