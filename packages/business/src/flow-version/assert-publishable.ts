import {
  FlowAuthoringException,
  publishFlowSchema,
  zodErrorToFlowAuthoringErrors,
} from "@chatbotx.io/flow-config"

/** Rejects graphs that would silently lose content on their configured channel. */
export const assertFlowGraphPublishable = (input: {
  edges: unknown
  nodes: unknown
}): void => {
  const result = publishFlowSchema.safeParse(input)
  if (!result.success) {
    throw new FlowAuthoringException(
      zodErrorToFlowAuthoringErrors(result.error, "invalidGraph"),
    )
  }
}
