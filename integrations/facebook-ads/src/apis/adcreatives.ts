import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookAdsGraphClient } from "../lib/http-client"
import { fetchAllMessagingAdsPages } from "../lib/messaging-ads-pagination"
import { operationIdNameFilter } from "../messaging-ads/constants"
import type {
  CreateAdCreativeInput,
  LinkData,
  MetaAdCreative,
  VideoData,
} from "../messaging-ads/types"
import { buildPageWelcomeMessage } from "../messaging-ads/welcome-message"

const AD_CREATIVE_FIELDS = "id,name"

const adCreativeSchema = z.object({ id: z.string().trim().min(1) })

function buildObjectStorySpec(input: CreateAdCreativeInput) {
  const welcomeMessage = buildPageWelcomeMessage(input.pageWelcomeMessage)

  // BOTH `call_to_action` AND `page_welcome_message` belong INSIDE the
  // `link_data`/`video_data` spec, never at the `object_story_spec` top level.
  // Every Meta messaging-ads example (Click-to-Messenger/Instagram/WhatsApp +
  // Multidestination) nests them here; a top-level `call_to_action` or
  // `page_welcome_message` is rejected/dropped, so the messaging click action
  // or the custom greeting would be silently lost (falls back to Meta's
  // default "Hello! Can I get more info on this?"). Verified against Meta docs
  // v25 examples.
  const welcomeField = welcomeMessage
    ? { page_welcome_message: welcomeMessage }
    : {}
  const mediaFields: { link_data?: LinkData; video_data?: VideoData } =
    input.media.kind === "image"
      ? {
          link_data: {
            ...input.media.linkData,
            call_to_action: input.callToAction,
            ...welcomeField,
          },
        }
      : {
          video_data: {
            ...input.media.videoData,
            call_to_action: input.callToAction,
            ...welcomeField,
          },
        }

  return {
    page_id: input.pageId,
    ...(input.instagramActorId
      ? { instagram_actor_id: input.instagramActorId }
      : {}),
    ...mediaFields,
  }
}

/**
 * `POST /act_{adAccount}/adcreatives` — full `object_story_spec` (image OR
 * video, all `link_data`/`video_data` fields per input, full
 * `page_welcome_message`, CTA). Media must already be uploaded
 * (`adimages.ts`/`advideos.ts`, video polled ready) before calling this.
 */
export function createAdCreative(
  input: CreateAdCreativeInput,
): Promise<MetaAdCreative> {
  const {
    accessToken,
    adAccountId,
    name,
    version = DEFAULT_API_VERSION,
  } = input
  const endpoint = `${version}/${adAccountId}/adcreatives`

  return rescue(endpoint, async () => {
    // Multipart form-data body (Meta's documented `-F` transport).
    // `object_story_spec` is a JSON-string field value.
    const response = await facebookAdsGraphClient.postFormFields<unknown>(
      endpoint,
      {
        access_token: accessToken,
        name,
        object_story_spec: JSON.stringify(buildObjectStorySpec(input)),
      },
    )
    return adCreativeSchema.parse(response)
  })
}

/** Reconcile step — creatives are act-level (no parent edge), so filter directly on the account. */
export function findAdCreativeByOperationId(input: {
  accessToken: string
  adAccountId: string
  operationId: string
  version?: string
}): Promise<MetaAdCreative | null> {
  const {
    accessToken,
    adAccountId,
    operationId,
    version = DEFAULT_API_VERSION,
  } = input
  const endpoint = `${version}/${adAccountId}/adcreatives`

  return rescue(endpoint, async () => {
    const rows = await fetchAllMessagingAdsPages<unknown>(endpoint, {
      fields: AD_CREATIVE_FIELDS,
      filtering: operationIdNameFilter(operationId),
      limit: "10",
      access_token: accessToken,
    })
    const parsed = z.array(adCreativeSchema).parse(rows)
    return parsed[0] ?? null
  })
}
