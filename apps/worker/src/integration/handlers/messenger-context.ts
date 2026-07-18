import { contactInboxService } from "@chatbotx.io/business"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"
import type { ExecuteStepProps } from "./flow-utils"

type ResolvedIntegrationContext = Awaited<
  ReturnType<typeof resolveIntegrationContextFromContactInbox>
>

export type ResolvedMessengerUserContext = ResolvedIntegrationContext & {
  psid: string
  contactInbox: ContactInboxModel
}

/**
 * Resolve the Messenger contact-inbox (PSID) for the conversation and the
 * integration context needed to call the Facebook APIs. Returns `null` when the
 * contact has no Messenger inbox or the inbox has no source PSID.
 */
export async function resolveMessengerUserContext(
  props: Pick<ExecuteStepProps<unknown>, "conversation" | "contactInbox">,
): Promise<ResolvedMessengerUserContext | null> {
  const { conversation, contactInbox: baseContactInbox } = props

  const contactInbox =
    baseContactInbox?.channel === "messenger"
      ? baseContactInbox
      : await contactInboxService
          .listByContactId({ contactId: conversation.contactId })
          .then(
            (inboxes) =>
              inboxes
                .filter((i) => i.channel === "messenger")
                .sort(
                  (a, b) =>
                    new Date(b.lastMessageAt ?? 0).getTime() -
                    new Date(a.lastMessageAt ?? 0).getTime(),
                )[0],
          )

  if (!contactInbox) {
    return null
  }

  const psid = contactInbox.sourceId
  if (!psid) {
    return null
  }

  const resolved = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  return { ...resolved, psid, contactInbox }
}
