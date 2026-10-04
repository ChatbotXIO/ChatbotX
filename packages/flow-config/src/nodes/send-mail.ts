import { z } from "zod"
import { emailStepDefaultFn, emailStepSchema } from "../steps/email"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const sendMailNodeSchema = baseNodeSchema.extend({
  type: z
    .literal(nodeTypeSchema.enum.sendMail)
    .describe('Node type "sendMail". `data.details.steps` holds email steps.'),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(emailStepSchema),
    }),
  }),
})

export type SendMailNodeSchema = z.infer<typeof sendMailNodeSchema>

export const sendMailNodeDefaultFn = (
  props: DefaultNodeProps,
): SendMailNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.sendMail,
  ...props.nodeProps,
  data: {
    name: "Send Mail",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [emailStepDefaultFn()],
    },
  },
})
