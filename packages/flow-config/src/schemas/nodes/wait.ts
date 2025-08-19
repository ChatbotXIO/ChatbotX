import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { waitStepDefaultFn, waitStepSchema } from "../steps/wait"
import { baseNodeSchema, type NewNodeProps, NodeType } from "./node-config"

export const waitNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.Wait),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    steps: z.array(waitStepSchema),
  }),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultFn = ({
  labelVersion,
  ...props
}: NewNodeProps): WaitNodeSchema => {
  return {
    id: createId(),
    type: NodeType.Wait,
    measured: { width: 288, height: 100 },
    ...props,
    data: {
      name: `Wait #${labelVersion}`,
      steps: [waitStepDefaultFn()],
    },
  }
}
