import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const splitTrafficStepSchema = z.object({
  id: zodBigintAsString().describe("Step id (numeric string)."),
  stepType: z
    .literal(stepTypes.enum.splitTraffic)
    .describe('Step type "splitTraffic".'),
  cases: z
    .array(
      z.object({
        value: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe("Percentage (0-100) of contacts sent down this branch."),
        nodeId: zodBigintAsString()
          .nullish()
          .describe(
            "Not used for routing; leave null. Branches are wired with edges whose `sourceHandle` is `<stepId>-case-<index>`, where index is the 0-based position in `cases`.",
          ),
      }),
    )
    .refine(
      (data) => {
        const total = data.reduce((acc, curr) => acc + curr.value, 0)
        return total === 100
      },
      {
        message: "The total sum must equal 100%.",
        path: ["cases"],
      },
    )
    .describe(
      "Branches of the split. The `value` percentages must sum to exactly 100.",
    ),
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
