import { z } from "zod"

export const connectExternalCalendarRequest = z.object({
  referer: z.url(),
})
export type ConnectExternalCalendarRequest = z.infer<
  typeof connectExternalCalendarRequest
>

export const updateExternalCalendarIdRequest = z.object({
  providerCalendarId: z.string().trim().min(1).max(255),
})
export type UpdateExternalCalendarIdRequest = z.infer<
  typeof updateExternalCalendarIdRequest
>
