import { z } from "zod"

/**
 * Why an approved template is (not) shown on the public store. Resolved in
 * this order: a template that is gone or foreign, a share that is off or
 * expired, otherwise published. A listing with no category is still published:
 * it shows under "All".
 */
export const templateStoreListingStatuses = z.enum([
  "published",
  "templateUnavailable",
  "shareDisabled",
])
export type TemplateStoreListingStatus = z.infer<
  typeof templateStoreListingStatuses
>

/** Storage caps per tenant, so the public catalog is always loaded whole. */
export const TEMPLATE_STORE_MAX_CATEGORIES = 50
export const TEMPLATE_STORE_MAX_LISTINGS = 500
export const TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH = 60
