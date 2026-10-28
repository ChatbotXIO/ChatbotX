import { contactService } from "@chatbotx.io/business"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingWithCursor,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listContactAdReferrals } from "../../lib/list-contact-ad-referrals"
import {
  listContactAdReferralsRequest,
  listContactAdReferralsResponse,
} from "../../schema/ad-referral"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsAdReferralsPublicRouter = {
  listAdReferrals: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/ad-referrals",
      summary: "List ads for contact",
      description:
        "Lists every ad click recorded for a contact (Click-to-WhatsApp, Click-to-Messenger/Instagram and Google Ads), newest first, each with the ad id, headline, channel and time. Resolve the contact with `contacts.get` first. Only clicks from when ad tracking began are recorded (see `trackingStartedAt` of `clickedAd` in `contacts.listFilterFields`). To find contacts by ad, use a `clickedAd` condition of a `contactFilter`; ad ids come from `ads.listReferralAds`.",
      tags: ["Contacts"],
    })
    .input(
      z
        .object({ identifier: publicContactIdentifier })
        .and(listContactAdReferralsRequest),
    )
    .output(listContactAdReferralsResponse)
    .errors({
      ...possibleErrorsOnFindingResource,
      ...possibleErrorsOnListingWithCursor,
    })
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await listContactAdReferrals({
        workspaceId: context.workspace.id,
        contactId,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),
}
