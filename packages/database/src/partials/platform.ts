import z from "zod"

export const platforms = z.enum(["web", "api", "worker"])
export type Platform = z.infer<typeof platforms>

export const RequestMetadata = z.object({
  platform: platforms,
  platformMetadata: z.string().optional(),
})
export type RequestMetadata = z.infer<typeof RequestMetadata>
