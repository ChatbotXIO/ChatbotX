import { findOrFail } from "@chatbotx.io/database/client"
import {
  type ChannelType,
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
import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js"
import { randomString } from "remeda"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { contactInboxService } from "../contact-inbox/service"
import { ChatbotXException, validationException } from "../errors"
import { messageCleanupService } from "../message-cleanup/service"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceService } from "../workspace/service"
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

const UNKNOWN_TARGET_COUNTRY = "unknown"
const E164_PREFIX_PATTERN = /^\+/

// No workspace country means local-format WhatsApp numbers must include "+".
const resolveDefaultRegion = (
  targetCountry: string | null | undefined,
): CountryCode | undefined =>
  targetCountry && targetCountry !== UNKNOWN_TARGET_COUNTRY
    ? (targetCountry as CountryCode)
    : undefined

const resolveContactSourceId = ({
  channel,
  parsedInput,
}: {
  channel: ChannelType
  parsedInput: CreateContactInput
}) => {
  if (channel === channelTypes.enum.smtp) {
    return parsedInput.email ?? ""
  }
  if (channel === channelTypes.enum.webchat) {
    return `${randomString(10)}${createId()}`
  }
  return parsedInput.contactId ?? ""
}

export const createContactWithInbox = async ({
  workspaceId,
  input: parsedInput,
}: {
  workspaceId: string
  input: CreateContactInput
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
    const parsed = parsePhoneNumberFromString(
      parsedInput.phoneNumber ?? "",
      resolveDefaultRegion(workspace.targetCountry),
    )
    // Do not use isValid(); it rejects well-formed but unassigned numbers.
    if (!parsed) {
      throw validationException(
        "phoneNumber",
        "Please include the country code (e.g. +84)",
      )
    }
    normalizedPhone = parsed.number
  }

  // WhatsApp `wa_id` is the E.164 digits without "+"; other channels key on their own id.
  let sourceId: string
  if (inboxChannel === channelTypes.enum.whatsapp) {
    sourceId = (normalizedPhone ?? "").replace(E164_PREFIX_PATTERN, "")
  } else {
    sourceId = resolveContactSourceId({ channel: inboxChannel, parsedInput })
  }

  const existedContact = normalizedPhone
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
      throw validationException(
        field,
        "This contact already exists on the selected inbox",
      )
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
            source: contactSources.enum.direct,
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
