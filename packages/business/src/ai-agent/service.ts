import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type RelationsFieldFilter,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  type AIAgentActionRule,
  aiAgentActionRulesSchema,
} from "@chatbotx.io/database/partials"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import type { AIAgentModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { customFieldService } from "../custom-field/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { notFoundException, validationException } from "../errors"
import { flowService } from "../flow/service"
import { tagService } from "../tag/service"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import {
  type TemplateLockKey,
  withTemplateLockedTransaction,
} from "../template/template-resource-locks"
import { referencedParentsOf } from "../template/uninstall-references"
import type { PaginatedResult } from "../types"
import { isWorkspaceAdminMember } from "../workspace-member/predicates"
import { workspaceMemberService } from "../workspace-member/service"

const AI_AGENT_CACHE_TTL_SECONDS = 5 * 60
const FILE_TOOL_PREFIX = "file:"

function filterTools(
  tools: string[] | null | undefined,
  matchFilePrefix: boolean,
): string[] {
  return (tools ?? []).filter(
    (tool) => tool.startsWith(FILE_TOOL_PREFIX) === matchFilePrefix,
  )
}

function isSameStringSet(a?: string[] | null, b?: string[] | null): boolean {
  const left = [...(a ?? [])].sort()
  const right = [...(b ?? [])].sort()
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

/** The flows, tags and custom fields an action-rule write points at: parents locked with the agent. */
const actionRuleParents = (
  actionRules: readonly AIAgentActionRule[] | undefined,
): TemplateLockKey[] =>
  (actionRules ?? [])
    .flatMap((rule) => rule.actions)
    .flatMap((action): TemplateLockKey[] => {
      switch (action.type) {
        case "send_flow":
          return [{ kind: "flow", resourceId: action.flowId }]
        case "add_tag":
        case "remove_tag":
          return [{ kind: "tag", resourceId: action.tagId }]
        case "set_custom_field":
        case "clear_custom_field":
          return [{ kind: "customField", resourceId: action.customFieldId }]
        default:
          return []
      }
    })

/** The files, functions and MCP servers an agent's `tools` tokens point at. */
const toolParents = (tools: readonly string[] | undefined): TemplateLockKey[] =>
  referencedParentsOf({ tools: tools ?? [] })

type AIAgentChangeGroup = "model" | "instructions" | "knowledge base"

function buildChangeGroupMessage(changed: AIAgentChangeGroup[]): string {
  if (changed.length === 1) {
    return `updated the AI Agent ${changed[0]}`
  }
  if (changed.length === 2) {
    return `updated the AI Agent ${changed[0]} and ${changed[1]}`
  }
  return `updated the AI Agent ${changed.slice(0, -1).join(", ")} and ${changed.at(-1)}`
}

function hasOtherFieldChanges(
  aiAgent: AIAgentModel,
  data: UpdateAIAgentRequest,
): boolean {
  if (data.name !== undefined && data.name !== aiAgent.name) {
    return true
  }
  if (
    data.temperature !== undefined &&
    data.temperature !== aiAgent.temperature
  ) {
    return true
  }
  if (
    data.maxOutputTokens !== undefined &&
    data.maxOutputTokens !== aiAgent.maxOutputTokens
  ) {
    return true
  }
  if (
    data.isRichResponse !== undefined &&
    data.isRichResponse !== aiAgent.isRichResponse
  ) {
    return true
  }
  if (
    data.messages !== undefined &&
    !isSameJsonValue(data.messages, aiAgent.messages)
  ) {
    return true
  }
  if (
    data.webSearchAuthorizedDomains !== undefined &&
    !isSameStringSet(
      normalizeWebSearchDomains(data.webSearchAuthorizedDomains),
      aiAgent.webSearchAuthorizedDomains,
    )
  ) {
    return true
  }
  if (
    data.tools !== undefined &&
    !isSameStringSet(
      filterTools(data.tools, false),
      filterTools(aiAgent.tools, false),
    )
  ) {
    return true
  }
  if (
    data.actionPrompt !== undefined &&
    data.actionPrompt !== aiAgent.actionPrompt
  ) {
    return true
  }
  if (
    data.actionRules !== undefined &&
    !isSameJsonValue(data.actionRules, aiAgent.actionRules)
  ) {
    return true
  }
  return false
}

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id: RelationsFieldFilter<string>
    workspaceId: RelationsFieldFilter<string>
    name: RelationsFieldFilter<string>
    isDefault: RelationsFieldFilter<boolean>
  }>
}

type WebSearchAuthorizedDomain = { value: string }

function normalizeWebSearchDomains(
  domains?: WebSearchAuthorizedDomain[] | null,
): string[] {
  const result = new Set<string>()
  for (const domain of domains ?? []) {
    const normalized = domain.value.trim().toLowerCase()
    if (normalized) {
      result.add(normalized)
    }
  }
  return Array.from(result)
}

export type CreateAIAgentRequest = {
  name: string
  prompt: string
  messages: Array<{ role: string; content: string }>
  models: Array<
    | { provider: string; model: string }
    | { kind: "openaiCompatible"; integrationId: string; model: string }
  >
  temperature: number
  maxOutputTokens: number
  tools: string[]
  isDefault: boolean
  isRichResponse: boolean
  webSearchAuthorizedDomains?: WebSearchAuthorizedDomain[] | null
  actionPrompt?: string | null
  actionRules?: AIAgentActionRule[]
}

export type UpdateAIAgentRequest = Partial<CreateAIAgentRequest>

export type ListAIAgentsRequest = {
  workspaceId: string
  page: number
  perPage: number
  sort: Array<{ id: string; desc: boolean }>
  name?: string
}

class AiAgentService extends BaseService {
  private getWorkspaceCacheTag(workspaceId: string): string {
    return `ai-agents:workspace:${workspaceId}`
  }

  private getListCacheKey(input: ListAIAgentsRequest): string {
    const parts: Record<string, string | number | undefined> = {
      workspaceId: input.workspaceId,
      page: input.page,
      perPage: input.perPage,
      sort: JSON.stringify(input.sort),
      name: input.name,
    }
    const key = Object.keys(parts)
      .filter((k) => parts[k] !== undefined)
      .sort()
      .map((k) => `${k}:${parts[k]}`)
      .join(":")
    return `ai-agents:list:${key}`
  }

  private getDefaultCacheKey(workspaceId: string): string {
    return `ai-agents:default:${workspaceId}`
  }

  /** Validate referenced targets at the write boundary, never trusting UI IDs. */
  private async validateActionRules(
    workspaceId: string,
    actionRules: AIAgentActionRule[] | undefined,
  ): Promise<AIAgentActionRule[]> {
    const rules = aiAgentActionRulesSchema.parse(actionRules ?? [])
    const actions = rules.flatMap((rule) => rule.actions)
    const flowIds = actions
      .filter((action) => action.type === "send_flow")
      .map((action) => action.flowId)
    const tagIds = actions
      .filter(
        (action): action is Extract<typeof action, { tagId: string }> =>
          action.type === "add_tag" || action.type === "remove_tag",
      )
      .map((action) => action.tagId)
    const customFieldIds = actions
      .filter(
        (action): action is Extract<typeof action, { customFieldId: string }> =>
          action.type === "set_custom_field" ||
          action.type === "clear_custom_field",
      )
      .map((action) => action.customFieldId)
    const assignedIds = actions
      .filter((action) => action.type === "assign_conversation")
      .map((action) =>
        "assignedId" in action ? action.assignedId : `u_${action.adminId}`,
      )
    const adminIds = assignedIds
      .filter((assignedId) => assignedId.startsWith("u_"))
      .map((assignedId) => assignedId.slice(2))
    const inboxTeamIds = assignedIds
      .filter((assignedId) => assignedId.startsWith("t_"))
      .map((assignedId) => assignedId.slice(2))

    const [flows, tags, fields, members, inboxTeams] = await Promise.all([
      Promise.all(
        [...new Set(flowIds)].map((id) =>
          flowService.findActiveById({ id, workspaceId }),
        ),
      ),
      tagService.findManyByIds({
        workspaceId,
        ids: [...new Set(tagIds)],
      }),
      customFieldService.findManyByIds({
        workspaceId,
        ids: [...new Set(customFieldIds)],
      }),
      Promise.all(
        [...new Set(adminIds)].map((userId) =>
          workspaceMemberService.findByWorkspaceIdAndUserId({
            workspaceId,
            userId,
          }),
        ),
      ),
      inboxTeamService.listExistingIds({
        workspaceId,
        ids: [...new Set(inboxTeamIds)],
      }),
    ])

    if (flows.some((flow) => !flow?.currentVersionId)) {
      throw validationException(
        "actionRules",
        "A selected flow must be active and published.",
      )
    }
    if (tags.length !== new Set(tagIds).size) {
      throw validationException("actionRules", "A selected tag is unavailable.")
    }
    if (fields.length !== new Set(customFieldIds).size) {
      throw validationException(
        "actionRules",
        "A selected custom field is unavailable.",
      )
    }
    if (members.some((member) => !(member && isWorkspaceAdminMember(member)))) {
      throw validationException(
        "actionRules",
        "Conversation assignees must be workspace administrators.",
      )
    }
    if (inboxTeams.length !== new Set(inboxTeamIds).size) {
      throw validationException(
        "actionRules",
        "A selected inbox team is unavailable.",
      )
    }

    return rules
  }

  async listAIAgents(
    input: ListAIAgentsRequest,
  ): Promise<PaginatedResult<AIAgentModel>> {
    return await withCache(
      this.getListCacheKey(input),
      async () => {
        const where = {
          workspaceId: input.workspaceId,
          name: input.name ? { ilike: likeContains(input.name) } : undefined,
        }

        const pagination = getPaginationWithDefaults(input)
        const orderBy = parseOrderByAsObject(aiAgentModel, input)

        const [data, total] = await Promise.all([
          db.query.aiAgentModel.findMany({
            where,
            orderBy,
            limit: pagination.limit,
            offset: pagination.offset,
          }),
          db.$count(aiAgentModel, relationsFilterToSQL(aiAgentModel, where)),
        ])

        return { data, pageCount: Math.ceil(total / input.perPage) }
      },
      {
        ttl: AI_AGENT_CACHE_TTL_SECONDS,
        tags: [this.getWorkspaceCacheTag(input.workspaceId)],
      },
    )
  }

  async findBy(props: FindByProps): Promise<AIAgentModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiAgentModel.findFirst({ where })
  }

  async findByIdForWorkspace(input: {
    id: string
    workspaceId: string
  }): Promise<AIAgentModel | undefined> {
    return await this.findBy({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async findDefault(workspaceId: string): Promise<AIAgentModel | undefined> {
    return await withCache(
      this.getDefaultCacheKey(workspaceId),
      () =>
        this.findBy({
          where: {
            workspaceId,
            isDefault: true,
          },
        }),
      {
        ttl: AI_AGENT_CACHE_TTL_SECONDS,
        tags: [this.getWorkspaceCacheTag(workspaceId)],
      },
    )
  }

  async create(
    workspaceId: string,
    data: CreateAIAgentRequest,
    tx?: DatabaseClient,
  ): Promise<string> {
    const created = await this.createAndReturn(workspaceId, data, tx)
    return created.id
  }

  async createAndReturn(
    workspaceId: string,
    data: CreateAIAgentRequest,
    tx?: DatabaseClient,
  ): Promise<AIAgentModel> {
    const id = createId()
    const actionRules = await this.validateActionRules(
      workspaceId,
      data.actionRules,
    )

    const execute = async (client: DatabaseClient) => {
      if (data.isDefault) {
        await client
          .update(aiAgentModel)
          .set({ isDefault: false })
          .where(eq(aiAgentModel.workspaceId, workspaceId))
      }
      const {
        webSearchAuthorizedDomains,
        actionRules: _actionRules,
        ...rest
      } = data
      const [inserted] = await client
        .insert(aiAgentModel)
        .values({
          ...rest,
          actionRules,
          webSearchAuthorizedDomains: normalizeWebSearchDomains(
            webSearchAuthorizedDomains,
          ),
          workspaceId,
          id,
        })
        .returning()
      return inserted
    }

    // Without a caller transaction the write is guarded: the referenced flow,
    // tag, field and tool parents are locked (and tombstoned ones refused)
    // before the row is inserted. A caller that passes its own transaction
    // owns the locking.
    const created = await (tx
      ? execute(tx)
      : withTemplateLockedTransaction(async (client) => {
          await assertReferencable({
            workspaceId,
            parents: [
              ...actionRuleParents(actionRules),
              ...toolParents(data.tools),
            ],
            tx: client,
          })
          return await execute(client)
        }))

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(workspaceId))

    if (!tx) {
      await this.audit("create", `created a new AI Agent (#${id})`)
    }

    return created
  }

  async updateAIAgent(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIAgentRequest,
  ): Promise<AIAgentModel> {
    // The early read only answers "does it exist" and "is there anything to
    // do"; the row that is diffed and audited is read again under the lock.
    const early = await this.findBy({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })

    if (!early) {
      throw notFoundException("AI agent not found")
    }

    const hasChanges = Object.values(data).some((value) => value !== undefined)
    if (!hasChanges) {
      return early
    }

    const actionRules =
      data.actionRules === undefined
        ? undefined
        : await this.validateActionRules(ctx.workspaceId, data.actionRules)

    // The agent and the flow/tag/field its action rules reference are locked
    // before the stored row is read, so the diff that decides the guard is
    // computed under the lock.
    const aiAgent = await withTemplateLockedTransaction(
      async (tx) => {
        const current = await tx.query.aiAgentModel.findFirst({
          where: { id: ctx.id, workspaceId: ctx.workspaceId },
        })
        if (!current) {
          throw notFoundException("AI agent not found")
        }
        await assertResourceEditable({
          workspaceId: ctx.workspaceId,
          resourceKind: "aiAgent",
          resourceIds: [current.id],
          changedKeys: changedKeysOf(current, data),
          referencedParents: [
            ...actionRuleParents(actionRules),
            ...toolParents(data.tools),
          ],
          tx,
        })
        if (data.isDefault) {
          await tx
            .update(aiAgentModel)
            .set({ isDefault: false })
            .where(eq(aiAgentModel.workspaceId, ctx.workspaceId))
        }
        const {
          webSearchAuthorizedDomains,
          actionRules: _actionRules,
          ...rest
        } = data
        await tx
          .update(aiAgentModel)
          .set({
            ...rest,
            ...(actionRules !== undefined && { actionRules }),
            ...(webSearchAuthorizedDomains !== undefined && {
              webSearchAuthorizedDomains: normalizeWebSearchDomains(
                webSearchAuthorizedDomains,
              ),
            }),
          })
          .where(eq(aiAgentModel.id, current.id))
        return current
      },
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [
          { kind: "aiAgent", resourceId: ctx.id },
          ...actionRuleParents(actionRules),
          ...toolParents(data.tools),
        ],
      },
    )

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(ctx.workspaceId))

    const changedKeys = Object.keys(data)

    if (changedKeys.length === 1 && changedKeys[0] === "isDefault") {
      if (data.isDefault !== aiAgent.isDefault) {
        await this.audit(
          "update",
          data.isDefault
            ? `set as default an AI Agent (#${aiAgent.id})`
            : `unset default an AI Agent (#${aiAgent.id})`,
        )
      }
      return await this.requireUpdatedAgent(ctx)
    }

    const changedGroups: AIAgentChangeGroup[] = []
    if (
      data.models !== undefined &&
      !isSameJsonValue(data.models, aiAgent.models)
    ) {
      changedGroups.push("model")
    }
    if (data.prompt !== undefined && data.prompt !== aiAgent.prompt) {
      changedGroups.push("instructions")
    }
    if (
      data.tools !== undefined &&
      !isSameStringSet(
        filterTools(data.tools, true),
        filterTools(aiAgent.tools, true),
      )
    ) {
      changedGroups.push("knowledge base")
    }

    if (changedGroups.length > 0) {
      await this.audit(
        "update",
        `${buildChangeGroupMessage(changedGroups)} (#${aiAgent.id})`,
      )
      return await this.requireUpdatedAgent(ctx)
    }

    if (hasOtherFieldChanges(aiAgent, data)) {
      await this.audit("update", `updated an AI Agent (#${aiAgent.id})`)
    }

    return await this.requireUpdatedAgent(ctx)
  }

  private async requireUpdatedAgent(ctx: {
    workspaceId: string
    id: string
  }): Promise<AIAgentModel> {
    const updated = await this.findBy({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })
    if (!updated) {
      throw notFoundException("AI agent not found")
    }
    return updated
  }

  /**
   * Public invalidation entrypoint for callers outside this service that
   * write AI agents directly, e.g. `templateInstallService` after a template
   * install commits — mirrors `customFieldService.invalidate`.
   */
  async invalidate(input: { workspaceId: string }): Promise<void> {
    await this.invalidateCacheTags(this.getWorkspaceCacheTag(input.workspaceId))
  }

  async delete(
    ctx: { workspaceId: string; ids: string[] },
    tx?: DatabaseClient,
  ): Promise<void> {
    const agents = await withDeleteGuard(
      {
        workspaceId: ctx.workspaceId,
        targets: [{ resourceKind: "aiAgent", resourceIds: ctx.ids }],
        tx,
      },
      (client) => this.deleteInTx(client, ctx),
    )

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(ctx.workspaceId))

    if (!tx) {
      for (const id of agents) {
        await this.audit("delete", `deleted an AI Agent (#${id})`)
      }
    }
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. Returns the ids actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    const rows = await tx
      .delete(aiAgentModel)
      .where(
        and(
          eq(aiAgentModel.workspaceId, input.workspaceId),
          inArray(aiAgentModel.id, input.ids),
        ),
      )
      .returning({ id: aiAgentModel.id })
    return rows.map((row) => String(row.id))
  }

  /** Drops the workspace's AI agent caches; the uninstall runs it after commit. */
  async invalidateWorkspaceCache(workspaceId: string): Promise<void> {
    await this.invalidateCacheTags(this.getWorkspaceCacheTag(workspaceId))
  }
}

export const aiAgentService = new AiAgentService()
