import { z } from "zod"

export const lifecycleStageInputSchema = z.object({
  id: z.string(),
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  position: z.number().int().min(0),
  isDefault: z.boolean(),
  isLost: z.boolean(),
  _new: z.boolean().optional(),
  _dirty: z.boolean().optional(),
  _deleted: z.boolean().optional(),
})

export const saveLifecycleStagesSchema = z.object({
  stages: z.array(lifecycleStageInputSchema),
})

export type LifecycleStageInput = z.infer<typeof lifecycleStageInputSchema>
export type SaveLifecycleStagesInput = z.infer<typeof saveLifecycleStagesSchema>
