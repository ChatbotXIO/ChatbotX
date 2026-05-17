import { z } from "zod"
import {
  baseNodeDataSchema,
  baseNodeSchema,
  type DefaultNodeProps,
  defaultNodeData,
  nodeTypeSchema,
} from "./base"

export const landingPageNodeSchema = baseNodeSchema.extend({
  type: z.literal(nodeTypeSchema.enum.landingPage),
  data: baseNodeDataSchema.extend({
    details: z.object({}),
  }),
})

export type LandingPageNodeSchema = z.infer<typeof landingPageNodeSchema>

export const landingPageNodeDefaultFn = (
  props: DefaultNodeProps,
): LandingPageNodeSchema => ({
  ...defaultNodeData(),
  type: nodeTypeSchema.enum.landingPage,
  ...props.nodeProps,
  data: {
    name: "Landing Page",
    isStartNode: false,
    ...props.dataProps,
    details: {},
  },
})
