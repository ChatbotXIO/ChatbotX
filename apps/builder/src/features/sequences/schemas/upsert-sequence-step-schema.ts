import { z } from "zod"

export const upsertSequenceStepRequest = z.object({
  stepId: z.cuid2().optional(),
  sequenceId: z.cuid2(),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).optional(),
  delayMinutes: z.number().int().min(0).optional(),
  delayUnit: z
    .enum(["immediate", "minutes", "hours", "days", "specificTime"])
    .optional(),
  specificDateTime: z.iso.datetime().optional(),
  flowId: z.cuid2().optional(),
  isActive: z.boolean().optional(),
  anytime: z.boolean().optional(),
  sendTimeStart: z.string().nullable().optional(),
  sendTimeEnd: z.string().nullable().optional(),
  sendDays: z.array(z.string()).optional(),
})

export type UpsertSequenceStepRequest = z.infer<
  typeof upsertSequenceStepRequest
>
