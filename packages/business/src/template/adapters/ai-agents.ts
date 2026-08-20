import { db } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import { remapReferences } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type AIAgentModelConfig =
  | { provider: string; model: string }
  | { kind: "openaiCompatible"; integrationId: string; model: string }

type TemplateAIAgentEntry = {
  sourceId: string
  name: string
  prompt: string | null
  messages: Array<{ role: string; content: string }>
  models: AIAgentModelConfig[]
  temperature: number
  maxOutputTokens: number
  // `fn:<sourceId>` / `file:<sourceId>` / `mcp:<sourceId>` tokens, rewritten
  // via the generic prefixed-token remapper — see `reference-fields.ts`.
  tools: string[]
  isDefault: boolean
  isRichResponse: boolean
  webSearchAuthorizedDomains?: string[] | null
}

/**
 * AIAgents insert directly against `aiAgentModel` (bypassing
 * `aiAgentService.create`, which mints its own id internally and does not
 * return the created row) so this adapter can mint the id up front and
 * track it immediately, mirroring `flowService.insertFlowWithDraft`.
 *
 * `tools` is remapped through the generic prefixed-token rules
 * (`fn:`/`file:`/`mcp:`) against whatever of `aiFunction`/`aiFile`/
 * `aiMcpServer` has already been resolved. AIFunctions insert earlier in
 * Phase 1, so `fn:` tokens resolve directly; `aiFile`/`aiMcpServer` are not
 * yet modeled as template categories, so those tokens are left unresolved
 * and reported as warnings (never corrupted — the prefix allowlist is
 * exact-key gated, so free text is never touched).
 *
 * `models[].integrationId` (the `openaiCompatible` variant) is dropped and
 * warned about, same treatment as the calendar's `externalConnectionId` —
 * an installed template should never silently point at the source
 * workspace's credential.
 */
export const aiAgentsAdapter: ResourceAdapter = {
  category: "aiAgents",
  providesKinds: ["aiAgent"],
  consumesKinds: ["aiFunction", "aiFile", "aiMcpServer"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.aiAgent) {
      ctx.idMaps.aiAgent = new Map()
    }
    const idMap = ctx.idMaps.aiAgent

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateAIAgentEntry
      const remappedTools = remapReferences(
        { tools: entry.tools },
        ctx.idMaps,
        {
          kinds: ["aiFunction", "aiFile", "aiMcpServer"],
          onUnresolved: (ref) =>
            ctx.warn({
              category: "aiAgents",
              entityKind: ref.entityKind,
              path: `aiAgents.${entry.sourceId}.tools`,
              value: ref.value,
            }),
        },
      )

      const models = entry.models.flatMap((model) =>
        keepInstallableModel(ctx, entry.sourceId, model),
      )

      const id = createId()
      await ctx.tx.insert(aiAgentModel).values({
        id,
        workspaceId: ctx.workspaceId,
        name: entry.name,
        prompt: entry.prompt,
        messages: entry.messages,
        models,
        temperature: entry.temperature,
        maxOutputTokens: entry.maxOutputTokens,
        tools: remappedTools.tools,
        // Never carry `isDefault` across workspaces — the target workspace
        // already has its own default agent (or none), and blindly
        // installing a second `isDefault: true` row would race the unique
        // "one default per workspace" invariant `aiAgentService.create`
        // otherwise enforces by clearing the flag first.
        isDefault: false,
        isRichResponse: entry.isRichResponse,
        webSearchAuthorizedDomains: entry.webSearchAuthorizedDomains ?? [],
      })

      idMap.set(entry.sourceId, id)
      ctx.track({
        category: "aiAgents",
        resourceKind: "aiAgent",
        resourceId: id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: {
    async resolveIds(workspaceId) {
      const rows = await db.query.aiAgentModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.aiAgentModel.findMany({
        where: { workspaceId, id: { in: uniqueIds } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
      const rows = await db.query.aiAgentModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        prompt: row.prompt,
        messages: row.messages,
        // `models[].integrationId` (the `openaiCompatible` variant) still
        // points at the source workspace's own credential here — dropped at
        // install time (`keepInstallableModel`), not here, since collect
        // has no warnings channel and the install-side drop already covers
        // every source this row could come from.
        models: row.models,
        temperature: row.temperature,
        maxOutputTokens: row.maxOutputTokens,
        tools: row.tools,
        isDefault: row.isDefault,
        isRichResponse: row.isRichResponse,
        webSearchAuthorizedDomains: row.webSearchAuthorizedDomains,
      }))

      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}

/**
 * Drops (rather than corrupts) an `openaiCompatible` model entry — its
 * `integrationId` points at a credential in the *source* workspace, which
 * the target workspace never has. Writing an empty/garbage id would pass
 * validation and fail invisibly at inference time, so the entry is skipped
 * and warned about instead.
 */
const keepInstallableModel = (
  ctx: TemplateInstallContext,
  sourceId: string,
  model: AIAgentModelConfig,
): AIAgentModelConfig[] => {
  if (!("kind" in model) || model.kind !== "openaiCompatible") {
    return [model]
  }
  ctx.warn({
    category: "aiAgents",
    entityKind: "integration",
    path: `aiAgents.${sourceId}.models.integrationId`,
    value: model.integrationId,
  })
  return []
}
