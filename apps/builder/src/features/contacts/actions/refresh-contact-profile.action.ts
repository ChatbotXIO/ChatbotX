"use server"

import {
  type ContactProfileRefreshResult,
  contactInboxService,
  contactProfileRefreshService,
  contactService,
  hasOnDemandProfileApi,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { profileFetcherFactories } from "../lib/profile-fetcher-factories"
import { requireContactPermissionScope } from "../permissions"
import {
  type RefreshContactProfileResult,
  refreshContactProfileRequest,
} from "../schema/action"
import type { ContactResource } from "../schema/resource"

// Maps the channel-agnostic service result onto the builder's client
// contract. `channelNotCapable` is a builder-level reason — the service
// itself never inspects the channel name, so it never produces it.
const toClientResult = (
  result: ContactProfileRefreshResult,
): RefreshContactProfileResult => {
  switch (result.status) {
    case "updated":
      return { status: "updated", contact: result.contact as ContactResource }
    case "skipped":
      return { status: "skipped", reason: result.reason }
    case "unavailable":
      return { status: "unavailable" }
    case "failed":
      return { status: "failed" }
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}

export const refreshContactProfileAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(refreshContactProfileRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, contactId],
      parsedInput,
    }): Promise<RefreshContactProfileResult> => {
      const accessScope = await requireContactPermissionScope(workspaceId)

      // Authorization is the gate — a contact outside the workspace/scope
      // fails here and nothing else (inbox lookup, integration resolution,
      // Graph call) runs.
      await contactService.findByIdOrFail({
        workspaceId,
        id: contactId,
        accessScope,
      })

      const contactInbox = await contactInboxService.findByUncached({
        where: { id: parsedInput.contactInboxId, contactId },
      })
      if (!contactInbox) {
        throw notFoundException("Contact inbox not found")
      }

      const channel = contactInbox.channel as ChannelType
      if (!hasOnDemandProfileApi(channel)) {
        return { status: "skipped", reason: "channelNotCapable" }
      }

      const fetchProfile = profileFetcherFactories[channel]({
        workspaceId,
        inboxId: contactInbox.inboxId,
        sourceId: contactInbox.sourceId,
      })

      const result = await contactProfileRefreshService.refresh({
        workspaceId,
        contactId,
        contactInbox: {
          id: contactInbox.id,
          channel,
          contactId: contactInbox.contactId,
          language: contactInbox.language,
        },
        source: "channelApi",
        accessScope,
        fetchProfile,
      })

      return toClientResult(result)
    },
  )
