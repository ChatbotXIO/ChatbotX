import { z } from "zod"

export const addPlatformAdminSchema = z.object({
  email: z.email().trim().toLowerCase(),
})

export const removePlatformAdminSchema = z.object({
  userId: z.string().min(1),
})
