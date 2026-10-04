import { z } from "zod"
import { addNotesStepDefaultFn, addNotesStepSchema } from "../steps/add-notes"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const addNotesNodeSchema = baseNodeSchema.extend({
  type: z
    .literal(nodeTypeSchema.enum.addNotes)
    .describe(
      'Node type "addNotes": a canvas annotation node. `data.details.beforeStep` holds one addNotes step whose `text` (max 1000 chars) is the note. It is documentation for flow editors only and does not post a note to the conversation at runtime.',
    ),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: addNotesStepSchema,
    }),
  }),
})
export type AddNotesNodeSchema = z.input<typeof addNotesNodeSchema>

export const addNotesNodeDefaultFn = (
  props: DefaultNodeProps,
): AddNotesNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.addNotes,
  ...props.nodeProps,
  data: {
    name: "Add Notes",
    ...props.dataProps,
    isStartNode: false,
    details: {
      beforeStep: addNotesStepDefaultFn(),
      ...props.detailProps,
    },
  },
})
