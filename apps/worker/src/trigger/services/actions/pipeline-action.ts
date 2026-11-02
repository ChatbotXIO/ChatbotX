import { runPipelineAction } from "@chatbotx.io/business/pipeline"
import { pipelineActionSchema } from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

/**
 * The trigger action "Pipelines": the flow step's runner, attributed to the
 * trigger. Business rules (target resolution, validation, dedup) stay in
 * `runPipelineAction`; this only supplies the contact's variable resolver and
 * maps the outcome.
 */
export const pipeline: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const parsed = pipelineActionSchema.safeParse(context.action)
  if (!parsed.success) {
    return skipped("invalidAction")
  }
  if (context.source.kind !== "trigger") {
    return skipped("unsupportedSource")
  }
  const { workspaceId, contactId } = context

  // Loaded once per action, and only when a field contains a variable.
  let variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
  const outcome = await runPipelineAction(parsed.data, {
    workspaceId,
    contactId,
    actor: {
      kind: "trigger",
      userId: null,
      sourceId: context.source.triggerId,
    },
    baseIdempotencyKey: context.occurrenceKey,
    interpolate: async (text) => {
      if (!text.includes("{{")) {
        return text
      }
      variables ??= await contactVariableService.getAll({
        contactId,
        contactInbox: context.contactInboxId ?? null,
        conversation,
      })
      return await contactVariableService.replaceAll({ text, variables })
    },
  })

  if (outcome.status === "success") {
    return succeeded
  }
  // A skip says why (no open item, ...); an error is a fixable configuration
  // problem whose detail is for logs, so the outcome carries a fixed reason.
  return skipped(
    outcome.status === "skip"
      ? (outcome.message ?? "pipelineSkipped")
      : "pipelineError",
  )
}
