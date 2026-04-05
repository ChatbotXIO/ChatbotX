import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const splitTrafficStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.splitTraffic),
  cases: z
    .array(
      z.object({
        value: z.number().int().min(0).max(100),
        nodeId: zodBigintAsString().nullish(),
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
  stepType: stepTypes.enum.splitTraffic,
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
