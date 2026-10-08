import { googleAdsConversionService } from "@chatbotx.io/business"
import { GOOGLE_ADS_EVENTS_MAX_PER_PAGE } from "@chatbotx.io/database/partials"
import type { GoogleAdsEventResource } from "../schema/events"
import { toGoogleAdsEventResource } from "./to-event-resource"

type ListEventsInput = Parameters<
  typeof googleAdsConversionService.listEvents
>[0]

/**
 * One page of the event history through the masked/redacted projection, shared
 * by the private and the public handler. `perPage` is clamped, never rejected.
 */
export const listGoogleAdsEventResources = async (
  input: ListEventsInput,
): Promise<{
  data: GoogleAdsEventResource[]
  total: number
  perPage: number
}> => {
  const perPage = Math.min(input.perPage, GOOGLE_ADS_EVENTS_MAX_PER_PAGE)
  const { rows, total } = await googleAdsConversionService.listEvents({
    ...input,
    perPage,
  })
  return { data: rows.map(toGoogleAdsEventResource), total, perPage }
}
