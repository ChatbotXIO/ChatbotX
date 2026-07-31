import {
  type FlowVersionSchema,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"
import type { z } from "zod"
import { resolveStepValidator } from "../react-flow/steps/channel-validator"
import { channelAwareStepValidators } from "../react-flow/steps/validators"

/**
 * Validates every step against the channel its node sends on.
 *
 * The channel lives on the node, not the step — a `sendMessage` node carries a
 * `chooseChannel` beforeStep — so a per-step rule can only be resolved from here,
 * where both are in scope.
 *
 * Runs on publish only. Draft autosave uses `z.array(z.any())`, so a half-built
 * step is still saved and the author is not interrupted mid-edit.
 */
export const refineStepsByChannel = (
  nodes: FlowVersionSchema[],
  ctx: z.RefinementCtx,
): void => {
  nodes.forEach((node, nodeIndex) => {
    if (node.type !== nodeTypeSchema.enum.sendMessage) {
      return
    }

    const { channel } = node.data.details.beforeStep

    node.data.details.steps.forEach((step, stepIndex) => {
      const validator = channelAwareStepValidators[step.stepType]
      if (!validator) {
        return
      }

      const result = resolveStepValidator(validator, channel).safeParse(step)
      if (result.success) {
        return
      }

      for (const issue of result.error.issues) {
        // Re-anchor onto the node path so the message resolver still finds the
        // validation code, and the issue points at the offending step.
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: [
            nodeIndex,
            "data",
            "details",
            "steps",
            stepIndex,
            ...issue.path,
          ],
        })
      }
    })
  })
}
