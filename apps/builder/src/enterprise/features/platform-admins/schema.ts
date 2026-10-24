import { platformAdminRoles } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const addPlatformAdminSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(platformAdminRoles),
})

export const removePlatformAdminSchema = z.object({
  userId: z.string().min(1),
})
