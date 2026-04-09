"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import type { RequestMetadata } from "@chatbotx.io/database/partials"
import { contactModel } from "@chatbotx.io/database/schema"
import type { ContactModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const blockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await blockContact(
      { workspaceId, id },
      {
        platform: "web",
      },
    )
  })

export const blockContact = async (
  props: {
    workspaceId: string
    id: string
  },
  metadata: RequestMetadata,
) => {
  const { workspaceId, id } = props

  const existingContact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId,
      id,
    },
    message: "Contact not found",
  })

  if (existingContact.blockedAt) {
    logger.info({ metadata }, `Contact ${id} is already blocked`)

    return {
      id: existingContact.id,
    }
  }

  const contact = await db
    .update(contactModel)
    .set({
      blockedAt: new Date(),
    })
    .where(eq(contactModel.id, existingContact.id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
  ])

  // 1- trigger realtime event
  // 2- trigger audit log

  await onBlockedContact(contact, metadata)

  return {
    id: contact.id,
  }
}

const onBlockedContact = async (
  contact: ContactModel,
  metadata: RequestMetadata,
) => {
  const { workspaceId, id } = props

  const contact = await findOrFail({
    table: contactModel,
    where: { workspaceId, id },
  })

  await integrationQueue.add(IntegrationJobAction.blockContact, {
    type: IntegrationJobAction.blockContact,
    data: {
      contact,
      platform,
    },
  })
}
