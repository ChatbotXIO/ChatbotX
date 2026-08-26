import type {
  MessagingAdCreativeMediaInput,
  MessagingAdTargetingInput,
  MessagingAdWelcomeMessageInput,
} from "@chatbotx.io/database/partials"
import {
  type CreativeMedia,
  enforceSpecialAdCategoryTargeting,
  type MessagingAdTargeting,
  type PageWelcomeMessage,
  type SpecialAdCategory,
} from "@chatbotx.io/integration-facebook-ads"

/** Domain (camelCase) targeting input -> the exact Graph `targeting` shape, with special-ad-category enforcement applied. */
export function mapTargeting(
  input: MessagingAdTargetingInput,
  specialAdCategories: SpecialAdCategory[],
): MessagingAdTargeting {
  const targeting: MessagingAdTargeting = {
    geo_locations: { countries: input.countries },
    ...(input.ageMin === undefined ? {} : { age_min: input.ageMin }),
    ...(input.ageMax === undefined ? {} : { age_max: input.ageMax }),
    ...(input.genders?.length ? { genders: input.genders } : {}),
    ...(input.locales?.length ? { locales: input.locales } : {}),
  }
  return enforceSpecialAdCategoryTargeting(targeting, specialAdCategories)
}

/** Domain media snapshot -> the exact Graph `link_data`/`video_data` creative media shape. */
export function mapCreativeMedia(
  input: MessagingAdCreativeMediaInput,
): CreativeMedia {
  if (input.kind === "image") {
    return {
      kind: "image",
      linkData: {
        link: input.link,
        image_hash: input.imageHash,
        ...(input.message ? { message: input.message } : {}),
        ...(input.headline ? { name: input.headline } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.caption ? { caption: input.caption } : {}),
      },
    }
  }
  return {
    kind: "video",
    videoData: {
      video_id: input.videoId,
      ...(input.thumbnailImageHash
        ? { image_hash: input.thumbnailImageHash }
        : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.linkDescription
        ? { link_description: input.linkDescription }
        : {}),
    },
  }
}

/** Domain welcome-message snapshot -> the integration layer's `PageWelcomeMessage` union (same shape today, kept as an explicit mapper for future divergence). */
export function mapWelcomeMessage(
  input: MessagingAdWelcomeMessageInput,
): PageWelcomeMessage {
  if (input.type === "default") {
    return { type: "default" }
  }
  if (input.type === "single") {
    return {
      type: "single",
      message: input.message,
      quickReplies: input.quickReplies,
    }
  }
  return { type: "templates", templates: input.templates }
}
