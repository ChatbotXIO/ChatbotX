"use server"

import { db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import { channelTypes, contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
  workspaceUsageModel,
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
import { revalidateCacheTags } from "@/lib/cache-helper"
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
  // Make sure phone number is not exists in the workspace
  const existedContact = await db.query.contactModel.findFirst({
    where: {
      workspaceId,
      phoneNumber: parsedInput.phoneNumber,
    },
  })
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

  const workspaceUsage = await findOrFail({
    table: workspaceUsageModel,
    where: { workspaceId },
    message: "Workspace usage not found",
  })
  if (workspaceUsage.contactsCount >= workspaceUsage.maxContacts) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      phoneNumber: {
        _errors: ["Max contacts reached"],
      },
    })
  }

  const [contact, contactInbox] = await db.transaction(async (tx) => {
    const [newContact] = await tx
      .insert(contactModel)
      .values({
        ...parsedInput,
        workspaceId,
        id: createId(),
      })
      .returning()

    const [newContactInbox] = await tx
      .insert(contactInboxModel)
      .values({
        originalContactId: newContact.id,
        contactId: newContact.id,
        inboxId: inbox.id,
        channel: channelTypes.enum.webchat,
        source: contactSources.enum.imported,
        sourceId: `${randomString()}${createId()}`,
      })
      .returning()

    await tx
      .update(workspaceUsageModel)
      .set({
        contactsCount: sql`${workspaceUsageModel.contactsCount} + 1`,
      })
      .where(eq(workspaceUsageModel.workspaceId, workspaceId))

    await tx.insert(conversationModel).values({
      workspaceId,
      contactId: newContact.id,
      id: createId(),
    })

    return [newContact, newContactInbox]
  })

  // Emit contact created event
  try {
    await emitContactCreated(
      workspaceId,
      contact.id,
      contact.firstName || undefined,
      contact.phoneNumber || undefined,
      contact.email || undefined,
    )
  } catch (error) {
    console.error("Failed to emit contactCreated event:", error)
  }

  if (contactInbox.sourceId) {
    emit("contact:created", {
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
    }).catch((error) => {
      console.error("[createContact] Failed to emit contact:created", error)
    })
  }

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
  ])

  return contact
}
