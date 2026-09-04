import {
  and,
  db,
  desc,
  eq,
  ilike,
  isNotNull,
  lt,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  tenantModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import type { PaginatedResult } from "../types"

export const SUPPORT_ACCESS_WINDOW_DAYS = 7

type SupportAccessAuditAction =
  | "support_access_enabled"
  | "support_access_disabled"

type ListWorkspacesInput = {
  page?: number | null
  perPage?: number | null
  keyword?: string
}

type ListWorkspacesRow = {
  id: string
  name: string
  ownerId: string
  ownerName: string | null
  ownerEmail: string
  tenantId: string
  tenantName: string | null
  createdAt: Date
  supportAccessUntil: Date | null
}

export class WorkspaceSupportAccessService extends BaseService {
  private auditAndLog(props: {
    action: SupportAccessAuditAction
    detail: string
    userId: string
    workspaceId: string
  }) {
    const { action, detail, userId, workspaceId } = props
    logger.info({ action, userId, workspaceId }, detail)
    return dispatchAuditRecord({ action, detail, userId, workspaceId })
  }

  /**
   * Owner opt-in: turns the Settings → General switch on for
   * `SUPPORT_ACCESS_WINDOW_DAYS`. Does not go through `workspaceService.update`
   * — that would also emit a generic "updated the workspace configuration"
   * audit row alongside this dedicated one.
   */
  async enable(props: {
    workspaceId: string
    actorUserId: string
  }): Promise<void> {
    const { workspaceId, actorUserId } = props

    const supportAccessUntil = new Date(
      Date.now() + SUPPORT_ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    )

    const [updated] = await db
      .update(workspaceModel)
      .set({ supportAccessUntil })
      .where(eq(workspaceModel.id, workspaceId))
      .returning({ id: workspaceModel.id })
    if (!updated) {
      throw notFoundException("Workspace not found")
    }

    await this.invalidateCacheTags([`workspaces:${workspaceId}`])

    await this.auditAndLog({
      action: "support_access_enabled",
      detail: `enabled platform support access for workspace ${workspaceId} until ${supportAccessUntil.toISOString()}`,
      userId: actorUserId,
      workspaceId,
    })
  }

  /**
   * Owner opt-out: turns the switch off immediately. Access is a synthetic
   * membership resolved fresh on every request from `supportAccessUntil`
   * (see `resolveWorkspaceMembership`), so clearing this column alone ends
   * every in-progress support session — there is no separate row to revoke.
   */
  async disable(props: {
    workspaceId: string
    actorUserId: string
  }): Promise<void> {
    const { workspaceId, actorUserId } = props

    const [updated] = await db
      .update(workspaceModel)
      .set({ supportAccessUntil: null })
      .where(eq(workspaceModel.id, workspaceId))
      .returning({ id: workspaceModel.id })
    if (!updated) {
      throw notFoundException("Workspace not found")
    }

    await this.invalidateCacheTags([`workspaces:${workspaceId}`])

    await this.auditAndLog({
      action: "support_access_disabled",
      detail: `disabled platform support access for workspace ${workspaceId}`,
      userId: actorUserId,
      workspaceId,
    })
  }

  /**
   * Sweeps every workspace whose `supportAccessUntil` window has passed and
   * clears it back to null. Access is already gated by comparing
   * `supportAccessUntil > now()` on every read (`isSupportAccessEnabled`),
   * so this does not change what is authorized — it only tidies the stale
   * timestamp for display/reporting (e.g. the admin workspaces list). No
   * audit record: this is not a security-relevant transition, just cleanup.
   */
  async clearExpired(): Promise<number> {
    const updated = await db
      .update(workspaceModel)
      .set({ supportAccessUntil: null })
      .where(
        and(
          isNotNull(workspaceModel.supportAccessUntil),
          lt(workspaceModel.supportAccessUntil, new Date()),
        ),
      )
      .returning({ id: workspaceModel.id })

    return updated.length
  }

  async listWorkspaces(
    input: ListWorkspacesInput,
  ): Promise<PaginatedResult<ListWorkspacesRow>> {
    const { keyword } = input
    const pagination = getPaginationWithDefaults(input)

    const keywordFilter = keyword
      ? or(
          ilike(workspaceModel.name, likeContains(keyword)),
          ilike(userModel.email, likeContains(keyword)),
          ilike(workspaceModel.id, likeContains(keyword)),
        )
      : undefined

    const [data, [{ count }]] = await Promise.all([
      db
        .select({
          id: workspaceModel.id,
          name: workspaceModel.name,
          ownerId: workspaceModel.ownerId,
          ownerName: userModel.name,
          ownerEmail: userModel.email,
          tenantId: workspaceModel.tenantId,
          tenantName: tenantModel.brandName,
          createdAt: workspaceModel.createdAt,
          supportAccessUntil: workspaceModel.supportAccessUntil,
        })
        .from(workspaceModel)
        .innerJoin(userModel, eq(workspaceModel.ownerId, userModel.id))
        .innerJoin(tenantModel, eq(workspaceModel.tenantId, tenantModel.id))
        .where(keywordFilter)
        .orderBy(
          sql`(${workspaceModel.supportAccessUntil} > now()) DESC NULLS LAST`,
          desc(workspaceModel.createdAt),
        )
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceModel)
        .innerJoin(userModel, eq(workspaceModel.ownerId, userModel.id))
        .where(keywordFilter),
    ])

    return {
      data,
      pageCount: Math.ceil(count / pagination.limit),
    }
  }
}

export const workspaceSupportAccessService = new WorkspaceSupportAccessService()
