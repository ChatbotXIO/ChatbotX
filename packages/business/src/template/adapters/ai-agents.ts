import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import { remapReferences } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { omitKeys } from "../fingerprint"
import {
  assertBackupFormat,
  EMPTY_COLLECT_RESULT,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  ResourceSyncHandler,
  TemplateInstallContext,
} from "./types"

/** The shape `serializeBackup` writes and `restoreBackup` reads. */
const BACKUP_FORMAT_VERSION = 1

/** Fields the installer owns: a sync never writes them, and they never enter the fingerprint. */
const AI_AGENT_INSTALLER_OWNED_FIELDS = ["isDefault"] as const

/** What a template update overwrites on an installed agent. */
const aiAgentContentSchema = z.object({
  name: z.string(),
  prompt: z.string().nullable(),
  messages: z.array(z.unknown()),
  models: z.array(z.unknown()),
  temperature: z.number(),
  maxOutputTokens: z.number().int(),
  tools: z.array(z.string()),
  isRichResponse: z.boolean(),
  webSearchAuthorizedDomains: z.array(z.string()),
})
type AIAgentContent = z.infer<typeof aiAgentContentSchema>
type AIAgentInsert = typeof aiAgentModel.$inferInsert

const toColumns = (content: AIAgentContent) => ({
  name: content.name,
  prompt: content.prompt,
  messages: content.messages as AIAgentInsert["messages"],
  models: content.models as AIAgentInsert["models"],
  temperature: content.temperature,
  maxOutputTokens: content.maxOutputTokens,
  tools: content.tools,
  isRichResponse: content.isRichResponse,
  webSearchAuthorizedDomains: content.webSearchAuthorizedDomains,
})

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<AIAgentContent | null> => {
  // Locked for the rest of the transaction (see the keywords adapter).
  const [row] = await tx
    .select()
    .from(aiAgentModel)
    .where(eq(aiAgentModel.id, resourceId))
    .for("update")
    .limit(1)
  return row
    ? {
        name: row.name,
        prompt: row.prompt,
        messages: row.messages,
        models: row.models,
        temperature: row.temperature,
        maxOutputTokens: row.maxOutputTokens,
        tools: row.tools,
        isRichResponse: row.isRichResponse,
        webSearchAuthorizedDomains: row.webSearchAuthorizedDomains,
      }
    : null
}

type AIAgentModelConfig =
  | { provider: string; model: string }
  | { kind: "openaiCompatible"; integrationId: string; model: string }

const MCP_TOOL_PREFIX = "mcp:"
const FILE_TOOL_PREFIX = "file:"

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
 * `aiMcpServer` has already been resolved. AIFunctions, MCP servers and AI
 * files insert earlier in Phase 1, so `fn:`, `mcp:` and `file:` tokens resolve
 * directly; one that does not resolve is reported as a warning (never corrupted — the prefix allowlist is
 * exact-key gated, so free text is never touched).
 *
 * `models[].integrationId` (the `openaiCompatible` variant) is dropped and
 * warned about, same treatment as the calendar's `externalConnectionId` —
 * an installed template should never silently point at the source
 * workspace's credential.
 */
export const aiAgentsAdapter: ResourceAdapter<TemplateAIAgentEntry> = {
  category: "aiAgents",
  providesKinds: ["aiAgent"],
  consumesKinds: ["aiFunction", "aiFile", "aiMcpServer"],
  deferredKinds: [],
  trackedKind: "aiAgent",
  folderTypes: [],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) => omitKeys(entry, AI_AGENT_INSTALLER_OWNED_FIELDS),
    unorderedPaths: ["webSearchAuthorizedDomains"],
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateAIAgentEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.aiAgent) {
      ctx.idMaps.aiAgent = new Map()
    }
    const idMap = ctx.idMaps.aiAgent

    for (const entry of entries) {
      const { tools, models } = resolveAgentReferences(ctx, entry)

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
        tools,
        // Never carry `isDefault` across workspaces — the target workspace
        // already has its own default agent (or none), and blindly
        // installing a second `isDefault: true` row would race the unique
        // "one default per workspace" invariant `aiAgentService.create`
        // otherwise enforces by clearing the flag first.
        isDefault: false,
        isRichResponse: entry.isRichResponse,
        webSearchAuthorizedDomains: entry.webSearchAuthorizedDomains ?? [],
        actionRules: [],
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

  sync: {
    async project(tx, resourceId) {
      return await readContent(tx, resourceId)
    },

    async serializeBackup(tx, resourceId) {
      const content = await readContent(tx, resourceId)
      return content ? { formatVersion: BACKUP_FORMAT_VERSION, content } : null
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = aiAgentContentSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The AI agent backup is not in a restorable shape")
      }
      await tx
        .update(aiAgentModel)
        .set(toColumns(parsed.data))
        .where(eq(aiAgentModel.id, resourceId))
    },

    // `isDefault` is the installer's; `actionPrompt`/`actionRules` are not
    // shipped, so they stay as they are. Tools and models resolve exactly as at
    // install (an unresolvable tool is dropped and warned about).
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const { tools, models } = resolveAgentReferences(ctx, entry)
        await ctx.tx
          .update(aiAgentModel)
          .set(
            toColumns({
              name: entry.name,
              prompt: entry.prompt,
              messages: entry.messages,
              models,
              temperature: entry.temperature,
              maxOutputTokens: entry.maxOutputTokens,
              tools,
              isRichResponse: entry.isRichResponse,
              webSearchAuthorizedDomains:
                entry.webSearchAuthorizedDomains ?? [],
            }),
          )
          .where(eq(aiAgentModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateAIAgentEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.aiAgentModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.aiAgentModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
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

      // An agent's `mcp:<serverId>` tools only work with their server, so the
      // servers travel with the agent (without their credentials).
      const mcpServerIds = new Set(
        entries.flatMap((entry) =>
          entry.tools.flatMap((tool) =>
            tool.startsWith(MCP_TOOL_PREFIX)
              ? [tool.slice(MCP_TOOL_PREFIX.length).split(":")[0]]
              : [],
          ),
        ),
      )

      // Knowledge files an agent searches (`file:<id>`) travel with it too.
      const fileIds = new Set(
        entries.flatMap((entry) =>
          entry.tools.flatMap((tool) =>
            tool.startsWith(FILE_TOOL_PREFIX)
              ? [tool.slice(FILE_TOOL_PREFIX.length)]
              : [],
          ),
        ),
      )

      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [
          ...[...mcpServerIds].map((sourceId) => ({
            category: "aiMcpServers" as const,
            sourceId,
          })),
          ...[...fileIds].map((sourceId) => ({
            category: "aiFiles" as const,
            sourceId,
          })),
        ],
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

/** The entry's tools and models as they install: references remapped, unusable models dropped. */
const resolveAgentReferences = (
  ctx: TemplateInstallContext,
  entry: TemplateAIAgentEntry,
): { tools: string[]; models: AIAgentModelConfig[] } => {
  const remapped = remapReferences({ tools: entry.tools }, ctx.idMaps, {
    kinds: ["aiFunction", "aiFile", "aiMcpServer"],
    onUnresolved: (ref) =>
      ctx.warn({
        category: "aiAgents",
        entityKind: ref.entityKind,
        path: `aiAgents.${entry.sourceId}.tools`,
        value: ref.value,
      }),
  })
  return {
    tools: remapped.tools,
    models: entry.models.flatMap((model) =>
      keepInstallableModel(ctx, entry.sourceId, model),
    ),
  }
}
