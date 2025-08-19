import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { baseNodeSchema, type NewNodeProps, NodeType } from "./node-config"

export const addNotesNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.AddNotes),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    message: z.string().trim().min(1).max(1000),
  }),
})

export type AddNotesNodeSchema = z.infer<typeof addNotesNodeSchema>

export const addNotesNodeDefaultFn = ({
  labelVersion,
  ...props
}: NewNodeProps): AddNotesNodeSchema => {
  return {
    id: createId(),
    type: NodeType.AddNotes,
    measured: {
      width: 288,
      height: 100,
    },
    ...props,
    data: {
      name: `Add notes ${labelVersion}`,
      message: "",
    },
  }
}
