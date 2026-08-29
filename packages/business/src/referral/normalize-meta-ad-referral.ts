import type { MessageReferral } from "@chatbotx.io/sdk"
import { deriveAdSourcePlatform } from "./ad-source-platform"

/**
 * Structural shape of the referral object Meta sends on Messenger/Instagram
 * (webhook `referral`/`postback.referral` payloads) — matches
 * `MessengerReferral`/`InstagramReferral` (the messenger, instagram, and
 * instagram-facebook integration packages' own zod-inferred types)
 * structurally, without this business-layer module depending on any of
 * those integration packages' generated types.
 */
export type MetaAdReferralInput = {
  ref?: string
  source: string
  type: string
  ad_id?: string
  source_url?: string
  source_platform?: string
  ads_context_data?: {
    ad_title?: string
    post_id?: string
    photo_url?: string
    video_url?: string
    product_id?: string
    flow_id?: string
  }
}

/**
 * Normalizes a raw Meta (Messenger/Instagram/Instagram-via-Facebook)
 * referral payload into the channel-agnostic `MessageReferral` shape used by
 * `ReceivedMessageResult`. Previously duplicated byte-for-byte as a local
 * `normalizeReferral` in
 * `integrations/instagram/src/handlers/message/incomming-message.ts`,
 * `integrations/messenger/src/handlers/message/incomming-message.ts`, and
 * `integrations/instagram-facebook/src/handlers/message/incoming-message.ts`
 * — moved here since all three already import `deriveAdSourcePlatform` from
 * this module.
 */
export function normalizeMetaAdReferral(
  referral: MetaAdReferralInput,
): MessageReferral {
  return {
    ref: referral.ref,
    source: referral.source,
    type: referral.type,
    adId: referral.ad_id ?? null,
    adTitle: referral.ads_context_data?.ad_title ?? null,
    sourceUrl: referral.source_url ?? null,
    sourcePlatform:
      referral.source_platform ?? deriveAdSourcePlatform(referral.source_url),
    postId: referral.ads_context_data?.post_id ?? null,
    photoUrl: referral.ads_context_data?.photo_url ?? null,
    videoUrl: referral.ads_context_data?.video_url ?? null,
    productId: referral.ads_context_data?.product_id ?? null,
    flowId: referral.ads_context_data?.flow_id ?? null,
    raw: referral,
  }
}
