import { z } from "zod"

export const magicLinkRequest = z.object({
  email: z.email(),
})
export type MagicLinkRequest = z.infer<typeof magicLinkRequest>

export const emailPasswordSignInRequest = z.object({
  email: z.email(),
  password: z.string().min(8),
})
export type EmailPasswordSignInRequest = z.infer<
  typeof emailPasswordSignInRequest
>
