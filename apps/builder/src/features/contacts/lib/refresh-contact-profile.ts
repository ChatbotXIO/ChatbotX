import {
  type ContactAccessScope,
  type ContactProfileRefreshResult,
  contactInboxService,
  contactProfileRefreshService,
  contactService,
  type OnDemandProfileChannel,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { RefreshContactProfileResult } from "../schema/action"
import type { ContactResource } from "../schema/resource"
import { profileFetcherFactories } from "./profile-fetcher-factories"

// Maps the channel-agnostic service result onto the builder's client
// contract. `channelNotCapable` is now produced by
// `contactProfileRefreshService.refresh` itself (the on-demand capability
// gate lives there, shared with the worker's inbound `channelApi` fetch).
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

export const refreshContactProfile = async (input: {
  workspaceId: string
  contactId: string
  contactInboxId: string
  accessScope?: ContactAccessScope
}): Promise<RefreshContactProfileResult> => {
  const { workspaceId, contactId, contactInboxId, accessScope } = input

  // Authorization is the gate — a contact outside the workspace/scope
  // fails here and nothing else (inbox lookup, integration resolution,
  // Graph call) runs.
  await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

  const contactInbox = await contactInboxService.findByUncached({
    where: { id: contactInboxId, contactId },
  })
  if (!contactInbox) {
    throw notFoundException("Contact inbox not found")
  }

  const channel = contactInbox.channel as ChannelType
  // Lazy: `profileFetcherFactories` is only defined for on-demand-capable
  // channels — this closure is only invoked by the service after it confirms
  // `hasOnDemandProfileApi(channel)`, so an unsupported channel never reaches
  // the (otherwise `undefined`) factory lookup.
  const fetchProfile = () =>
    profileFetcherFactories[channel as OnDemandProfileChannel]({
      workspaceId,
      inboxId: contactInbox.inboxId,
      sourceId: contactInbox.sourceId,
    })()

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
}
