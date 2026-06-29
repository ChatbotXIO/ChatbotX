"use server"

import {
  contactInboxService,
  contactService,
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
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
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js"
import { returnValidationErrors } from "next-safe-action"
import { randomString } from "remeda"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateContactRequest,
  type CreateContactResponse,
  createContactRequest,
} from "../schemas/action"

type CreateContactValidationField =
  | "contactId"
  | "email"
  | "inboxId"
  | "phoneNumber"
type CreateContactValidationFieldError = { _errors: string[] }
type CreateContactValidationFieldErrors = Partial<
  Record<CreateContactValidationField, CreateContactValidationFieldError>
>

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
  parsedInput: CreateContactRequest
}) => {
  if (channel === channelTypes.enum.smtp) {
    return parsedInput.email ?? ""
  }
  if (channel === channelTypes.enum.webchat) {
    return `${randomString()}${createId()}`
  }
  return parsedInput.contactId ?? ""
}

const duplicateIdentityErrorForChannel = (
  channel: ChannelType,
  error: CreateContactValidationFieldError,
): CreateContactValidationFieldErrors => {
  if (channel === channelTypes.enum.whatsapp) {
    return { phoneNumber: error }
  }
  if (channel === channelTypes.enum.smtp) {
    return { email: error }
  }
  return { contactId: error }
}

export const createContactAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createContactRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateContactRequest
    }) => {
      await createContact({ workspaceId, parsedInput })
    },
  )

export const createContact = async ({
  workspaceId,
  parsedInput,
}: {
  workspaceId: string
  parsedInput: CreateContactRequest
}): Promise<CreateContactResponse> => {
  const inbox = await findOrFail({
    table: inboxModel,
    where: { workspaceId, id: parsedInput.inboxId },
    message: "Inbox not found",
  })
  const inboxChannel = inbox.channel as ChannelType

  if (parsedInput.channel !== inboxChannel) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      inboxId: {
        _errors: ["Selected inbox does not match the selected source"],
      },
    })
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Workspace not found"],
      phoneNumber: { _errors: [] },
    })
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
      return returnValidationErrors(createContactRequest, {
        _errors: ["Validation Exception"],
        phoneNumber: {
          _errors: ["Please include the country code (e.g. +84)"],
        },
      })
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
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      phoneNumber: {
        _errors: ["Phone number is exists"],
      },
    })
  }

  if (inboxChannel !== channelTypes.enum.webchat) {
    const existing = await contactInboxService.findLatestBySource({
      inboxId: inbox.id,
      sourceId,
    })
    if (existing) {
      const dup = {
        _errors: ["This contact already exists on the selected inbox"],
      }
      return returnValidationErrors(createContactRequest, {
        _errors: ["Validation Exception"],
        ...duplicateIdentityErrorForChannel(inboxChannel, dup),
      })
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

  const result = await quotaEnforcementService.createNewContactWithMac({
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
          source: contactSources.enum.imported,
          sourceId,
        })
        .returning()
      if (!contactInbox) {
        throw new ChatbotXException("Contact inbox not found")
      }

      await tx.insert(conversationModel).values({
        workspaceId,
        contactId: contact.id,
        id: createId(),
      })

      return {
        value: { contact, contactInbox },
        contactId: contact.id,
        contactInboxId: contactInbox.id,
        inboxId: inbox.id,
      }
    },
  })

  if (!result.ok) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      phoneNumber: { _errors: ["Contact limit reached"] },
    })
  }

  const { contact, contactInbox } = result.value

  await emitContactCreated(
    workspaceId,
    contact.id,
    contact.firstName || undefined,
    contact.phoneNumber || undefined,
    contact.email || undefined,
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

  return contact
}
