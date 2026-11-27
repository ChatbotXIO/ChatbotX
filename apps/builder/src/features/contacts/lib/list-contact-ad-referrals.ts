import {
  type ContactAccessScope,
  type ContactAdTouch,
  listContactAdTouches,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor-pagination"
import type {
  ContactAdReferralResource,
  ListContactAdReferralsResponse,
} from "../schema/ad-referral"

const toResource = (touch: ContactAdTouch): ContactAdReferralResource => ({
  id: touch.id,
  adId: touch.adId,
  title: touch.metadata?.adTitle ?? null,
  channel: touch.channel,
  provider: touch.provider,
  campaignId: touch.campaignId,
  adGroupId: touch.adGroupId,
  source: touch.source,
  sourceUrl: touch.sourceUrl,
  occurredAt: touch.occurredAt,
})

/** One implementation for the token API and the inbox UI. */
export async function listContactAdReferrals(input: {
  workspaceId: string
  contactId: string
  perPage: number
  cursor?: string
  accessScope?: ContactAccessScope
}): Promise<ListContactAdReferralsResponse> {
  const cursor = decodeCursor(input.cursor)
  // A corrupt cursor must not restart at page 1 (a client appending pages would repeat rows).
  if (input.cursor && !cursor) {
    throw new ChatbotXException(
      "The cursor is invalid. Start again without a cursor.",
      "invalidCursor",
      400,
    )
  }
  const { data, nextCursor } = await listContactAdTouches({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    limit: input.perPage,
    cursor: cursor
      ? { occurredAt: cursor.createdAt, id: cursor.id }
      : undefined,
    accessScope: input.accessScope,
  })

  // The shared cursor codec has no `occurredAt` slot: it rides in `createdAt`.
  return {
    data: data.map(toResource),
    nextCursor: nextCursor
      ? encodeCursor({
          direction: "next",
          createdAt: nextCursor.occurredAt,
          id: nextCursor.id,
        })
      : null,
  }
}
