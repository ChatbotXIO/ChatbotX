import { z } from "zod"
import { emailButtonStepSchema } from "../steps/email-button"
import { emailCodeStepSchema } from "../steps/email-code"
import { emailH3StepSchema } from "../steps/email-h3"
import {
  emailHeaderStepDefaultFn,
  emailHeaderStepSchema,
} from "../steps/email-header"
import { emailImageStepSchema } from "../steps/email-image"
import { emailLineStepSchema } from "../steps/email-line"
import { emailSpacingStepSchema } from "../steps/email-spacing"
import { emailTextStepSchema } from "../steps/email-text"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  NodeType,
} from "./base"

export const sendMailNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.sendMail),
  data: baseNodeDataSchema.extend({
    details: z.object({
      beforeStep: emailHeaderStepSchema,
      steps: z.array(
        z.union([
          emailH3StepSchema,
          emailTextStepSchema,
          emailImageStepSchema,
          emailButtonStepSchema,
          emailSpacingStepSchema,
          emailCodeStepSchema,
          emailLineStepSchema,
        ]),
      ),
    }),
  }),
})

export type SendMailNodeSchema = z.infer<typeof sendMailNodeSchema>

export const sendMailNodeDefaultFn = (
  props: DefaultNodeProps,
): SendMailNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.sendMail,
  ...props.nodeProps,
  data: {
    name: "Send Mail",
    isStartNode: false,
    ...props.dataProps,
    details: {
      beforeStep: emailHeaderStepDefaultFn(),
      steps: [],
      ...props.detailProps,
    },
  },
})
