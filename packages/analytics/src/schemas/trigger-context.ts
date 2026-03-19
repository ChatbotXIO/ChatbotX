import { z } from "zod"

export const triggerSourceSchema = z.enum([
  "worker",
  "api",
  "webhook",
  "scheduler",
  "manual",
])
export type TriggerSource = z.infer<typeof triggerSourceSchema>

export const triggerContextSchema = z.object({
  triggerHandler: z.string(),
  triggerSource: triggerSourceSchema,
  triggerType: z.string(),
})
export type TriggerContext = z.infer<typeof triggerContextSchema>
