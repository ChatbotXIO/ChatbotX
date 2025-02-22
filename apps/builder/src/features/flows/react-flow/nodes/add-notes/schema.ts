import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { NodeType, baseNodeSchema } from "../../types"

export const addNotesNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.AddNotes),
  data: z.object({
    name: z.string().min(1).max(255).trim(),
    message: z.string().min(1).max(1000).trim(),
  }),
})

export type AddNotesNodeSchema = z.infer<typeof addNotesNodeSchema>

export const defaultAddNotesNode = ({
  labelVersion,
  position = { x: 100, y: 100 },
}: {
  labelVersion: number
  position?: { x: number; y: number }
}): AddNotesNodeSchema => {
  return {
    id: createId(),
    type: NodeType.AddNotes,
    position,
    data: {
      name: `Add notes ${labelVersion}`,
      message: "",
    },
  }
}
