import { z } from "zod"

export const submitBookingRequestSchema = z.object({
  token: z.string().min(1),
  selectedStartAt: z.iso.datetime(),
  inviteeTimezone: z.string().trim().min(1).max(64),
})

export const cancelBookingRequestSchema = z.object({
  token: z.string().min(1),
})
