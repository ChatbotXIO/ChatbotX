"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import type { CloneMessengerTemplateResult } from "../lib/clone-contract"
import {
  cloneTargetsRequestSchema,
  cloneTemplateToPage,
  errorMessageOf,
  invalidateTemplateCaches,
  outcomeOf,
  resolveCloneContext,
  resyncAndFindCandidate,
  runCloneBatches,
  summarizeCloneResults,
} from "../lib/clone-pipeline"

export const cloneMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .schema(cloneTargetsRequestSchema)
  .action(async (props): Promise<CloneMessengerTemplateResult> => {
    const {
      bindArgsParsedInputs: [
        workspaceId,
        sourceIntegrationMessengerId,
        templateId,
      ],
      parsedInput: { targetIntegrationMessengerIds },
      ctx: { user },
    } = props

    const { source, targets } = await resolveCloneContext({
      workspaceId,
      sourceIntegrationMessengerId,
      templateId,
      userId: user.id,
      targetIntegrationMessengerIds,
    })

    const results = await runCloneBatches(targets, (target) =>
      cloneTemplateToPage({ source, target }),
    )

    await invalidateTemplateCaches([
      workspaceId,
      ...targets.map((target) => target.workspaceId),
    ])

    return summarizeCloneResults(results)
  })

/**
 * Re-reads the pages where a clone is still under review and reports the
 * current status of every requested page — nothing is created here.
 */
export const recheckMessengerTemplateClonesAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .schema(cloneTargetsRequestSchema)
  .action(async (props): Promise<CloneMessengerTemplateResult> => {
    const {
      bindArgsParsedInputs: [
        workspaceId,
        sourceIntegrationMessengerId,
        templateId,
      ],
      parsedInput: { targetIntegrationMessengerIds },
      ctx: { user },
    } = props

    const { source, targets } = await resolveCloneContext({
      workspaceId,
      sourceIntegrationMessengerId,
      templateId,
      userId: user.id,
      targetIntegrationMessengerIds,
    })

    const results = await runCloneBatches(targets, async (target) => {
      const base = { integrationMessengerId: target.id, channel: target.name }
      try {
        const candidate = await resyncAndFindCandidate({ source, target })
        return candidate
          ? { ...base, ...outcomeOf(candidate, "existing") }
          : { ...base, status: "failed", error: "Template not found on page" }
      } catch (error) {
        return { ...base, status: "failed", error: errorMessageOf(error) }
      }
    })

    await invalidateTemplateCaches([
      workspaceId,
      ...targets.map((target) => target.workspaceId),
    ])

    return summarizeCloneResults(results)
  })
