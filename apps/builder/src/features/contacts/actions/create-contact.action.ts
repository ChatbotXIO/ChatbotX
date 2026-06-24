"use server"

import {
  contactService,
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail } from "@chatbotx.io/database/client"
import { channelTypes, contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  conversationModel,
  inboxModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
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
  const existedContact = parsedInput.phoneNumber
    ? await contactService.findByPhone({
        workspaceId,
        phoneNumber: parsedInput.phoneNumber,
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

  const inbox = await findOrFail({
    table: inboxModel,
    where: { workspaceId, channel: channelTypes.enum.webchat },
    message: "Inbox not found",
  })

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Workspace not found"],
      phoneNumber: { _errors: [] },
    })
  }

  const result = await quotaEnforcementService.createNewContactWithMac({
    ownerId: workspace.ownerId,
    workspaceId,
    create: async (tx) => {
      const contact = await contactService.insert({
        workspaceId,
        data: parsedInput,
        tx,
      })

      const [contactInbox] = await tx
        .insert(contactInboxModel)
        .values({
          originalContactId: contact.id,
          contactId: contact.id,
          inboxId: inbox.id,
          channel: channelTypes.enum.webchat,
          source: contactSources.enum.imported,
          sourceId: `${randomString()}${createId()}`,
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
