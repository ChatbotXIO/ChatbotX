import {
  RESTRICTED_SPECIAL_AD_CATEGORIES,
  type SpecialAdCategory,
} from "./constants"
import type { MessagingAdTargeting } from "./types"

export function isRestrictedSpecialAdCategory(
  categories: SpecialAdCategory[],
): boolean {
  return categories.some((category) =>
    RESTRICTED_SPECIAL_AD_CATEGORIES.includes(category),
  )
}

/**
 * MANDATORY server-side enforcement (out/plan/ctm-ctid-ads-manager.md
 * "Special ad categories (CORRECTED — enforcement, not a warning)"): selecting
 * a restricted category strips age/gender targeting — a UI warning alone is
 * not a control, and Meta remains the final validator regardless. Returns a
 * NEW targeting object; never mutates the input.
 */
export function enforceSpecialAdCategoryTargeting(
  targeting: MessagingAdTargeting,
  categories: SpecialAdCategory[],
): MessagingAdTargeting {
  if (!isRestrictedSpecialAdCategory(categories)) {
    return targeting
  }
  const { age_min, age_max, genders, ...rest } = targeting
  return rest
}
