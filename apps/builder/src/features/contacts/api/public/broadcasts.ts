import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingWithCursor,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { contactIdFor } from "@/lib/public-api/member-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listContactBroadcastsPage } from "../../lib/list-contact-broadcasts"
import {
  listContactBroadcastsRequest,
  listContactBroadcastsResponse,
} from "../../schema/contact-broadcast"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsBroadcastsPublicRouter = {
  listBroadcasts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/broadcasts",
      summary: "List broadcasts sent to contact",
      description:
        "Lists the broadcasts that were sent to a contact, newest first, each with the broadcast id and name, its channel and schedule, and how far it got for this contact (`failed`, `clicked`, `seen`, `delivered` or `sent`). Drafts, deleted broadcasts and broadcasts that never reached this contact are left out. Pass `search` to find one by part of its name or by its exact id. Resolve the contact with `contacts.get` first; read a broadcast in full with `broadcasts.get`.",
      tags: ["Contacts"],
    })
    .input(
      z
        .object({ identifier: publicContactIdentifier })
        .and(listContactBroadcastsRequest),
    )
    .output(listContactBroadcastsResponse)
    .errors({
      ...possibleErrorsOnFindingResource,
      ...possibleErrorsOnListingWithCursor,
    })
    .handler(async ({ context, input }) => {
      const contactId = await contactIdFor(context, input.identifier)
      return await listContactBroadcastsPage({
        workspaceId: context.workspace.id,
        contactId,
        perPage: input.perPage,
        cursor: input.cursor,
        search: input.search,
      })
    }),
}
