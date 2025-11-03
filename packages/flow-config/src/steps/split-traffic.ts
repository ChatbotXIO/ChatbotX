import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const splitTrafficStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.splitTraffic),
  cases: z
    .array(
      z.object({
        value: z.number().int().min(0).max(100),
        nodeId: z.cuid2().nullish(),
      }),
    )
    .refine((data) => data.reduce((acc, curr) => acc + curr.value, 0) === 100, {
      message: "Total percentage must be 100",
      path: ["cases"],
    }),
})

export type SplitTrafficStepSchema = z.infer<typeof splitTrafficStepSchema>

export const splitTrafficStepDefaultFn = (): SplitTrafficStepSchema => ({
  id: createId(),
  stepType: StepType.splitTraffic,
  cases: [
    {
      value: 50,
      nodeId: null,
    },
    {
      value: 50,
      nodeId: null,
    },
  ],
})
