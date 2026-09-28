import {
  type ContactInboxPhoneTransition,
  contactInboxService,
  contactService,
} from "@chatbotx.io/business"
import type { IntegrationJobWhatsappIdentityChange } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"

type IdentityChangeData = IntegrationJobWhatsappIdentityChange["data"]
type IdentityChange = IdentityChangeData["payload"]["change"]
type IdentityChangeResult = Awaited<
  ReturnType<typeof contactInboxService.rotateScopedUserId>
>

const dispatchIdentityChange = async (
  inboxId: string,
  change: IdentityChange,
): Promise<IdentityChangeResult> => {
  switch (change.kind) {
    case "userIdChanged":
      return await contactInboxService.rotateScopedUserId({
        inboxId,
        previousUserId: change.previousUserId,
        userId: change.userId,
        previousParentUserId: change.previousParentUserId,
        parentUserId: change.parentUserId,
        previousPhone: change.previousPhone,
        newPhone: change.newPhone,
      })
    case "phoneChanged":
      return await contactInboxService.changePrimaryPhone({
        inboxId,
        previousPhone: change.previousPhone,
        newPhone: change.newPhone,
        userId: change.userId,
      })
    default: {
      const exhaustiveCheck: never = change
      return exhaustiveCheck
    }
  }
}

const updateContactPhoneIfSafe = async (props: {
  workspaceId: string
  contactId: string
  contactInboxId: string
  transition: ContactInboxPhoneTransition
}): Promise<void> => {
  try {
    const updated = await contactService.adoptPhoneNumberIfSafe({
      workspaceId: props.workspaceId,
      id: props.contactId,
      previousPhone: props.transition.previousPhone,
      newPhone: props.transition.newPhone,
    })
    if (!updated) {
      logger.info(
        {
          contactId: props.contactId,
          contactInboxId: props.contactInboxId,
        },
        "Whatsapp identity change phone number adoption skipped",
      )
    }
  } catch (err) {
    logger.warn(
      {
        err,
        contactId: props.contactId,
        contactInboxId: props.contactInboxId,
      },
      "Whatsapp identity change phone number update failed",
    )
  }
}

export const handleWhatsappIdentityChange = async (
  data: IdentityChangeData,
): Promise<void> => {
  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      "whatsapp",
      data.integrationIdentifier,
    )
  const { change } = data.payload
  const result = await dispatchIdentityChange(inbox.id, change)

  logger.info(
    {
      changeKind: change.kind,
      integrationIdentifier: data.integrationIdentifier,
      messageId: data.payload.messageId,
      outcome: result.status,
    },
    "Whatsapp identity change processed",
  )

  if (result.status === "invalid") {
    logger.warn(
      {
        changeKind: change.kind,
        integrationIdentifier: data.integrationIdentifier,
        messageId: data.payload.messageId,
      },
      "Whatsapp identity change ignored: invalid identity transition",
    )
    return
  }

  if (
    (result.status === "applied" || result.status === "alreadyApplied") &&
    result.phoneTransition
  ) {
    await updateContactPhoneIfSafe({
      workspaceId: inbox.workspaceId,
      contactId: result.contactInbox.contact.id,
      contactInboxId: result.contactInbox.id,
      transition: result.phoneTransition,
    })
  }
}
