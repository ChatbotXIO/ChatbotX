import { eq } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { aiFunctionService } from "../../ai-function/service"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateAIFunctionEntry = {
  sourceId: string
  name: string
  purpose?: string | null
  dataCollect: Array<{ from: string; to: string }>
  outputMessage?: string | null
  // Points at a `resources.flows` sourceId — flows insert *after*
  // aiFunctions in Phase 1 (per install ordering), so this is always
  // deferred to Phase 2, never resolved at insert time.
  triggerFlowId?: string | null
}

/**
 * AIFunctions insert with `triggerFlowId: null` — flows are inserted later
 * in Phase 1 (`products -> settings -> aiFunctions -> aiAgents -> calendars
 * -> webchats -> flows -> ...`), so the target flow id can never be known
 * yet. The returned `PatchTask` fixes it up (a single-column update, so
 * every other field written at insert time is left untouched) once
 * `idMaps.flow` is complete.
 */
export const aiFunctionsAdapter: ResourceAdapter = {
  category: "aiFunctions",
  providesKinds: ["aiFunction"],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.aiFunction) {
      ctx.idMaps.aiFunction = new Map()
    }
    const idMap = ctx.idMaps.aiFunction
    const pendingTriggerFlowBySourceId = new Map<string, string>()

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateAIFunctionEntry
      const [created] = await aiFunctionService.create(
        ctx.workspaceId,
        {
          name: entry.name,
          purpose: entry.purpose,
          dataCollect: entry.dataCollect,
          outputMessage: entry.outputMessage,
          triggerFlowId: null,
        },
        ctx.tx,
      )

      idMap.set(entry.sourceId, created.id)
      if (entry.triggerFlowId) {
        pendingTriggerFlowBySourceId.set(created.id, entry.triggerFlowId)
      }
      ctx.track({
        category: "aiFunctions",
        resourceKind: "aiFunction",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "aiFunctions",
        apply: async (patchCtx) => {
          for (const [
            aiFunctionId,
            flowSourceId,
          ] of pendingTriggerFlowBySourceId) {
            const targetFlowId = patchCtx.idMaps.flow?.get(flowSourceId)
            if (!targetFlowId) {
              patchCtx.warn({
                category: "aiFunctions",
                entityKind: "flow",
                path: `aiFunctions.${aiFunctionId}.triggerFlowId`,
                value: flowSourceId,
              })
              continue
            }
            await patchCtx.tx
              .update(aiFunctionModel)
              .set({ triggerFlowId: targetFlowId })
              .where(eq(aiFunctionModel.id, aiFunctionId))
          }
        },
      },
    ]
  },
}
