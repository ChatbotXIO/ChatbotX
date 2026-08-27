import { z } from "zod"

/**
 * `adsCampaignCreative` gates the create-ad-wizard's presigned image upload
 * to an ads-specific handler (super-admin only, `ads-campaign/creatives`
 * path prefix) — see `apps/builder/src/lib/upload/handlers.ts`. Its literal
 * value is duplicated (not imported) as
 * `MESSAGING_AD_CREATIVE_UPLOAD_KIND` in `@chatbotx.io/integration-facebook-ads`
 * because `database` cannot depend on that package — the same reason
 * `messagingAdChannelTypes` duplicates `adsEligibleChannelTypes`.
 */
export const uploadTypes = z.enum(["import", "generic", "adsCampaignCreative"])
export type UploadTypes = z.infer<typeof uploadTypes>

export const fileTypes = z.enum(["image", "video", "audio", "gif", "file"])
export type FileType = z.infer<typeof fileTypes>

export const fileContextTypes = z.enum(["import", "generic", "export"])
export type FileContextType = z.infer<typeof fileContextTypes>

export const fileStatuses = z.enum(["pending", "uploaded", "failed"])
export type FileStatus = z.infer<typeof fileStatuses>

export const exportSubTypes = z.enum(["contacts", "coupons"])
export type ExportSubType = z.infer<typeof exportSubTypes>
