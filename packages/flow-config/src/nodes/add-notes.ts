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
  type: z.literal(nodeTypeSchema.enum.addNotes),
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
