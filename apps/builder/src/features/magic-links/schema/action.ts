import { z } from "zod"

const PATH_SEGMENT = /^([a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/

export const createMagicLinkRequest = z.object({
  name: z.string().regex(PATH_SEGMENT).min(1).max(128),
  url: z.url().max(1000),
})
export type CreateMagicLinkRequest = z.infer<typeof createMagicLinkRequest>

export const updateMagicLinkRequest = createMagicLinkRequest.partial()
export type UpdateMagicLinkRequest = z.infer<typeof updateMagicLinkRequest>
