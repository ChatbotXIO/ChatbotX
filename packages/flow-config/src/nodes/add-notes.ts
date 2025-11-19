import { z } from "zod"
import { addNotesStepDefaultFn, addNotesStepSchema } from "../steps/add-notes"
import {
  baseNodeDefaultFn,
  baseNodeSchema,
  type NodeFnProps,
  NodeType,
} from "./base"

export const addNotesNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.addNotes),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: addNotesStepSchema,
    afterStep: z.null(),
    steps: z.null(),
  }),
})

export type AddNotesNodeSchema = z.input<typeof addNotesNodeSchema>

export const addNotesNodeDefaultFn = (props: NodeFnProps<AddNotesNodeSchema>) =>
  baseNodeDefaultFn<AddNotesNodeSchema>({
    ...props,
    type: NodeType.addNotes,
    beforeStep: addNotesStepDefaultFn(),
  })
