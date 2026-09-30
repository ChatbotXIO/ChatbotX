import { z } from "zod"
import { refineStepsByChannel } from "./channel-rules/channel-step-refinement"
import { edgeSchema, flowVersionSchema } from "./nodes"

/**
 * The graph shape allowed to become live. Draft schemas intentionally do not
 * use this: authors must be able to retain incompatible content while editing
 * a node for another channel.
 */
export const publishFlowSchema = z.object({
  nodes: z
    .array(flowVersionSchema)
    .superRefine(refineStepsByChannel)
    .describe("Raw flow node graph, as sent by the builder UI."),
  edges: z
    .array(edgeSchema)
    .describe("Raw flow edge graph, as sent by the builder UI."),
})

export type PublishFlowSchema = z.infer<typeof publishFlowSchema>
