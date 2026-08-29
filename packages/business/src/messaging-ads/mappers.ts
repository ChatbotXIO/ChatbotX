import {
  isLegacyImageMedia,
  type MessagingAdCreativeMediaInput,
  type MessagingAdTargetingInput,
  type MessagingAdWelcomeMessageInput,
} from "@chatbotx.io/database/partials"
import {
  type CreativeMedia,
  enforceSpecialAdCategoryTargeting,
  isRestrictedSpecialAdCategory,
  type MessagingAdTargeting,
  type PageWelcomeMessage,
  type SpecialAdCategory,
} from "@chatbotx.io/integration-facebook-ads"

/** Domain (camelCase) targeting input -> the exact Graph `targeting` shape, with special-ad-category enforcement applied. */
export function mapTargeting(
  input: MessagingAdTargetingInput,
  specialAdCategories: SpecialAdCategory[],
): MessagingAdTargeting {
  // Graph v23.0 requires an explicit `advantage_audience` on ad set CREATE
  // (code 100 otherwise). Opting in (1) makes Meta reject `age_max` and cap
  // `age_min` at 25, and Advantage+ audience is only partially rolled out for
  // restricted special ad categories — so opt out (0) whenever the user
  // customized ANY targeting field (age/gender/locales) or a restricted
  // category applies; opt in (1) only for the countries-only default setup,
  // the one combination live-verified against v23.0. Locales are treated as
  // customization out of caution: the docs list language as a non-negotiable
  // constraint under Advantage+, but the 1+locales combo is unverified live.
  const hasCustomTargeting =
    input.ageMin !== undefined ||
    input.ageMax !== undefined ||
    Boolean(input.genders?.length) ||
    Boolean(input.locales?.length)
  const advantageAudience =
    hasCustomTargeting || isRestrictedSpecialAdCategory(specialAdCategories)
      ? 0
      : 1
  const targeting: MessagingAdTargeting = {
    geo_locations: { countries: input.countries },
    targeting_automation: { advantage_audience: advantageAudience },
    ...(input.ageMin === undefined ? {} : { age_min: input.ageMin }),
    ...(input.ageMax === undefined ? {} : { age_max: input.ageMax }),
    ...(input.genders?.length ? { genders: input.genders } : {}),
    ...(input.locales?.length ? { locales: input.locales } : {}),
  }
  return enforceSpecialAdCategoryTargeting(targeting, specialAdCategories)
}

/**
 * Domain media snapshot -> the exact Graph `link_data`/`video_data` creative
 * media shape. `resolvedImageHash` is the transient, never-persisted
 * `image_hash` derived at create time (legacy `imageHash` rows already carry
 * their own hash and never need one).
 */
export function mapCreativeMedia(
  input: MessagingAdCreativeMediaInput,
  resolvedImageHash?: string,
): CreativeMedia {
  if (input.kind === "image") {
    const imageHash = isLegacyImageMedia(input)
      ? input.imageHash
      : resolvedImageHash
    if (!imageHash) {
      throw new Error(
        "mapCreativeMedia: a stored-image creative requires a resolved image_hash",
      )
    }
    return {
      kind: "image",
      linkData: {
        link: input.link,
        image_hash: imageHash,
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
