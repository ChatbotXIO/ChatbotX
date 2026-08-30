import { z } from "zod"

export const updateWhatsappProfileRequest = z.object({
  about: z.string().trim().max(255),
  description: z.string().trim().max(255),
  address: z.string().trim().max(255),
  email: z.email(),
  websiteUrl: z.url(),
})
export type UpdateWhatsappProfileRequest = z.infer<
  typeof updateWhatsappProfileRequest
>
