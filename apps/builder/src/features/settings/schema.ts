import { z } from "zod"

export const settingSchema = z.object({
  content: z.string().min(1).max(100).optional(),
})

export type SettingSchema = z.infer<typeof settingSchema>
