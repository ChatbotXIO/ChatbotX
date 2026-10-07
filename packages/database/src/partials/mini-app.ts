import { z } from "zod"

/** Where a Mini App submission came from. WhatsApp replies stay in `WhatsappFlowResponse`. */
export const miniAppSubmissionSources = z.enum(["web"])
export type MiniAppSubmissionSource = z.infer<typeof miniAppSubmissionSources>

/** A web-link upload is `pending` until the visitor submits the Mini App. */
export const miniAppUploadStatuses = z.enum(["pending", "submitted"])
export type MiniAppUploadStatus = z.infer<typeof miniAppUploadStatuses>
