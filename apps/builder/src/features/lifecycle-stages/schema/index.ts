import { z } from "zod"

// Paridade Respond.io: até 20 fases no total (Lifecycle + Lost combinados).
// Fonte: workspace-settings.md — "pode criar, renomear e gerir até 20 fases".
export const MAX_LIFECYCLE_STAGES = 20

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
  stages: z
    .array(lifecycleStageInputSchema)
    .refine(
      (stages) =>
        stages.filter((s) => !s._deleted).length <= MAX_LIFECYCLE_STAGES,
      {
        message: `Máximo de ${MAX_LIFECYCLE_STAGES} etapas permitidas (ativas + perdidas).`,
      },
    ),
})

export type LifecycleStageInput = z.infer<typeof lifecycleStageInputSchema>
export type SaveLifecycleStagesInput = z.infer<typeof saveLifecycleStagesSchema>
