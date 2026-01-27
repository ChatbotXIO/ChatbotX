import { z } from "zod"
import { emailButtonStepSchema } from "../steps/email-button"
import { emailCodeStepSchema } from "../steps/email-code"
import { emailH3StepSchema } from "../steps/email-h3"
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

export const landingPageNodeSchema = baseNodeSchema.extend({
  type: z.literal(NodeType.landingPage),
  data: baseNodeDataSchema.extend({
    details: z.object({
      steps: z.array(
        z.union([
          emailH3StepSchema,
          emailTextStepSchema,
          emailImageStepSchema,
          emailButtonStepSchema,
          emailCodeStepSchema,
          emailSpacingStepSchema,
          emailLineStepSchema,
        ]),
      ),
    }),
  }),
})

export type LandingPageNodeSchema = z.infer<typeof landingPageNodeSchema>

export const landingPageNodeDefaultFn = (
  props: DefaultNodeProps,
): LandingPageNodeSchema => ({
  ...defaultNodeData(),
  type: NodeType.landingPage,
  ...props.nodeProps,
  data: {
    name: "Landing Page",
    isStartNode: false,
    ...props.dataProps,
    details: {
      steps: [],
      ...props.detailProps,
    },
  },
})
