import { contactTouchpointService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingWithCursor,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { contactIdFor } from "@/lib/public-api/member-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listContactTouchpointsRequest,
  listContactTouchpointsResponse,
} from "../../schema/touchpoint"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsTouchpointsPublicRouter = {
  listTouchpoints: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/touchpoints",
      summary: "List touchpoints of contact",
      description:
        "Lists how a contact came in and which tools they took part in (inbound messages and comments, minigames, leaderboards, questionnaires, Mini Apps, polls, lead forms, inbound webhooks, comment automations, ref links and QR codes, magic links, WhatsApp forms), newest first. Each row names the tool item with `kind` + `resourceKey` and carries per-kind `details` with exact counts; the `kind` field of each item documents its rule and retention. Appointments, coupons and ads have their own operations. It is a live view: a row can move to an earlier page between two calls, so de-duplicate by `kind` + `resourceKey` and start again from the first page to refresh. Resolve the contact with `contacts.get` first. Filter with `kinds` (repeat it or separate with commas).",
      tags: ["Contacts"],
    })
    .input(
      z
        .object({ identifier: publicContactIdentifier })
        .and(listContactTouchpointsRequest),
    )
    .output(listContactTouchpointsResponse)
    .errors({
      ...possibleErrorsOnFindingResource,
      ...possibleErrorsOnListingWithCursor,
    })
    .handler(async ({ context, input }) => {
      const contactId = await contactIdFor(context, input.identifier)
      return await contactTouchpointService.list({
        workspaceId: context.workspace.id,
        contactId,
        kinds: input.kinds,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),
}
