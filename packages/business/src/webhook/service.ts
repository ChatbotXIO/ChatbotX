import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conditionModel, webhookModel } from "@chatbotx.io/database/schema"
import type { WebhookModel } from "@chatbotx.io/database/types"
import { removeWebhookCache, updateWebhookCache } from "@chatbotx.io/events"
import { distributedLock } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { folderService } from "../folder/service"
import { assertPublicUrl } from "../net/ssrf-guard"
import {
  type ConditionInput,
  toConditionColumnsShared as toConditionColumns,
} from "../trigger/condition-columns"

export const MAX_WEBHOOKS_PER_WORKSPACE = 100
const LOCK_TIMEOUT_SECONDS = 30

export type WebhookConditionInput = {
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

class WebhookService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<WebhookModel[]> {
    return await db
      .select()
      .from(webhookModel)
      .where(eq(webhookModel.workspaceId, workspaceId))
  }

  async register(props: {
    workspaceId: string
    name: string
    url: string
    conditions: WebhookConditionInput[]
  }): Promise<WebhookModel> {
    const { workspaceId, name, url, conditions } = props

    try {
      await assertPublicUrl(url, "Webhook URL")
    } catch (error) {
      throw new ChatbotXException(
        error instanceof Error ? error.message : "Invalid webhook URL",
        "invalidRequestData",
        422,
      )
    }

    const created = await distributedLock.runExclusive({
      key: `webhook:${workspaceId}`,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        const count = await db.$count(
          webhookModel,
          eq(webhookModel.workspaceId, workspaceId),
        )
        if (count >= MAX_WEBHOOKS_PER_WORKSPACE) {
          throw new ChatbotXException(
            `Workspace has reached the maximum of ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks`,
            "webhookLimitReached",
          )
        }

        return await db.transaction(async (tx) => {
          const [webhook] = await tx
            .insert(webhookModel)
            .values({ id: createId(), workspaceId, name, url })
            .returning()

          await tx.insert(conditionModel).values(
            conditions.map((condition) => ({
              id: createId(),
              webhookId: webhook.id,
              type: condition.type,
              sourceId: condition.sourceId ?? null,
              operator: condition.operator ?? null,
              value: condition.value ?? null,
            })),
          )

          return webhook
        })
      },
    })

    await updateWebhookCache(workspaceId)

    await this.audit("create", `created a new webhook (#${created.id})`)

    return created
  }

  async unregister(props: { workspaceId: string; id: string }): Promise<void> {
    const { workspaceId, id } = props

    const deleted = await db
      .delete(webhookModel)
      .where(
        and(eq(webhookModel.id, id), eq(webhookModel.workspaceId, workspaceId)),
      )
      .returning({ id: webhookModel.id })

    if (deleted.length === 0) {
      throw notFoundException("Webhook not found")
    }

    await removeWebhookCache(workspaceId)

    await this.audit("delete", `deleted webhook(s) (#${id})`)
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    return await db.$count(
      webhookModel,
      eq(webhookModel.workspaceId, workspaceId),
    )
  }

  /**
   * Creates a webhook row with an empty `url` — the builder sets the real
   * URL afterward via `updateWithConditions`. Deliberately separate from
   * `register` above, which requires a valid public URL + conditions up
   * front and takes a distributed lock: do not consolidate the two, the
   * builder's create-then-configure flow depends on this one accepting an
   * empty URL.
   */
  async createDraft(input: {
    workspaceId: string
    name: string
    folderId?: string | null
    [key: string]: unknown
  }): Promise<WebhookModel> {
    const { workspaceId, folderId, ...webhookData } = input

    if (folderId) {
      await folderService.ensureExists({
        id: folderId,
        workspaceId,
        folderType: "webhook",
      })
    }

    const result = await db
      .insert(webhookModel)
      .values({
        id: createId(),
        ...webhookData,
        folderId,
        workspaceId,
        url: "",
      })
      .returning()
      .then((rows) => rows[0])

    await updateWebhookCache(workspaceId)

    await this.audit("create", `created a new webhook (#${result.id})`)

    return result
  }

  /** Mirrors `triggerService.deleteMany` — bulk delete scoped to the workspace. */
  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const deletedWebhooks = await db.query.webhookModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.ids } },
      columns: { id: true },
    })

    await db
      .delete(webhookModel)
      .where(
        and(
          eq(webhookModel.workspaceId, input.workspaceId),
          inArray(webhookModel.id, input.ids),
        ),
      )

    await removeWebhookCache(input.workspaceId)

    if (deletedWebhooks.length > 0) {
      await this.audit(
        "delete",
        `deleted webhook${deletedWebhooks.length > 1 ? "s" : ""} (${deletedWebhooks.map((webhook) => `#${webhook.id}`).join(", ")})`,
      )
    }
  }

  /**
   * Updates a webhook's `url` and diffs its `conditions` (delete/update/
   * create), in one transaction. Unlike `triggerService.updateWithConditions`,
   * this updates ALL submitted conditions unconditionally (no `isSameJsonValue`
   * diff) and ALWAYS refreshes the cache — do not factor the two into one
   * shared helper, the behaviors are deliberately different.
   */
  async updateWithConditions(input: {
    workspaceId: string
    id: string
    url: string
    conditions: ConditionInput[]
  }): Promise<WebhookModel | undefined> {
    const { workspaceId, id, url, conditions } = input

    const result = await db.transaction(async (tx) => {
      const existingConditions = await tx.query.conditionModel.findMany({
        where: {
          webhookId: id,
        },
      })

      const existingIds = new Set(existingConditions.map((c) => c.id))
      const submittedIds = new Set(
        conditions.filter((c) => c.id).map((c) => c.id as string),
      )

      const conditionsToDelete = existingConditions.filter(
        (existing) => !submittedIds.has(existing.id),
      )

      const conditionsToUpdate = conditions.filter(
        (c) => c.id && existingIds.has(c.id as string),
      )

      const conditionsToCreate = conditions.filter((c) => !c.id)

      await tx
        .update(webhookModel)
        .set({ url })
        .where(
          and(
            eq(webhookModel.workspaceId, workspaceId),
            eq(webhookModel.id, id),
          ),
        )

      if (conditionsToDelete.length > 0) {
        await tx.delete(conditionModel).where(
          inArray(
            conditionModel.id,
            conditionsToDelete.map((c) => c.id),
          ),
        )
      }

      for (const condition of conditionsToUpdate) {
        await tx
          .update(conditionModel)
          .set(toConditionColumns(condition))
          .where(eq(conditionModel.id, condition.id as string))
      }

      if (conditionsToCreate.length > 0) {
        await tx.insert(conditionModel).values(
          conditionsToCreate.map((c) => ({
            id: createId(),
            webhookId: id,
            ...toConditionColumns(c),
          })),
        )
      }

      return await tx.query.webhookModel.findFirst({
        where: {
          id,
        },
      })
    })

    await updateWebhookCache(workspaceId)

    if (result) {
      await this.audit("update", `updated a webhook (#${result.id})`)
    }

    return result
  }

  /**
   * Applies a settings patch after diffing against the current row — a
   * no-op submit returns early without writing or auditing. Keeps the same
   * `enabled`/`disabled` vs `updated` audit branching as
   * `triggerService.updateSettings`.
   */
  async updateSettings(input: {
    workspaceId: string
    id: string
    [key: string]: unknown
  }): Promise<void> {
    const { workspaceId, id, ...patch } = input

    const webhook = await db.query.webhookModel.findFirst({
      where: {
        id,
        workspaceId,
      },
    })

    if (!webhook) {
      throw notFoundException("Webhook not found")
    }

    const changedEntries = Object.entries(patch).filter(
      ([key, value]) => webhook[key as keyof typeof webhook] !== value,
    )

    if (changedEntries.length === 0) {
      return
    }

    const updated = await db
      .update(webhookModel)
      .set(patch)
      .where(eq(webhookModel.id, webhook.id))
      .returning({ id: webhookModel.id })

    if (updated.length === 0) {
      return
    }

    await updateWebhookCache(workspaceId)

    const changedKeys = changedEntries.map(([key]) => key)
    let detail = `updated a webhook (#${webhook.id})`
    if (changedKeys.length === 1 && changedKeys[0] === "active") {
      detail = patch.active
        ? `enabled a webhook (#${webhook.id})`
        : `disabled a webhook (#${webhook.id})`
    }

    await this.audit("update", detail)
  }
}

export const webhookService = new WebhookService()
