import { and, type DatabaseClient, db, eq, isNull, lt, or } from "../../client"
import { type ChannelType, inboxStatuses } from "../../partials"
import { THREAD_CONTROL_SEEN_REFRESH_MS } from "../../partials/thread-control"
import { connectionModel, inboxModel, workspaceModel } from "../../schema"
import type { InboxModel } from "../../types"

export type InboxChannelOption = { id: string; name: string }

export type InboxAnalyticsOption = {
  id: string
  name: string
  channel: string
}

/**
 * Reads of the `Inbox` row itself. The richer inbox reads (with integrations,
 * with caching) live in `inboxService`; this exists so a worker handler can
 * resolve one inbox by id without pulling the service's module graph.
 */
export type InboxIdentity = {
  id: string
  name: string
  channel: string
  status: string
}

export const inboxRepository = {
  /**
   * The workspace's inboxes among `ids`, as the lean identity a template
   * manifest needs (never credentials or integration rows).
   */
  async listIdentitiesByIds(
    input: { workspaceId: string; ids: readonly string[] },
    tx: DatabaseClient = db,
  ): Promise<InboxIdentity[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx.query.inboxModel.findMany({
      columns: { id: true, name: true, channel: true, status: true },
      where: { workspaceId: input.workspaceId, id: { in: [...input.ids] } },
    })
  },

  /**
   * The connected inboxes of every workspace in `workspaceIds` on any of
   * `channels`, for a binding picker — one query however many workspaces there
   * are, so a user with many workspaces costs the same as one with a single one.
   */
  async listConnectedIdentitiesByChannels(
    input: { workspaceIds: readonly string[]; channels: readonly string[] },
    tx: DatabaseClient = db,
  ): Promise<(InboxIdentity & { workspaceId: string })[]> {
    if (input.channels.length === 0 || input.workspaceIds.length === 0) {
      return []
    }
    return await tx.query.inboxModel.findMany({
      columns: {
        id: true,
        name: true,
        channel: true,
        status: true,
        workspaceId: true,
      },
      where: {
        workspaceId: { in: [...input.workspaceIds] },
        status: inboxStatuses.enum.connected,
        channel: { in: [...input.channels] },
      },
      orderBy: { name: "asc" },
    })
  },

  async findById(input: {
    id: string
    tx?: DatabaseClient
  }): Promise<InboxModel | undefined> {
    const { tx = db } = input
    return await tx.query.inboxModel.findFirst({
      where: { id: input.id },
    })
  },

  /**
   * Bounded id/name projection scoped by `workspaceId` and `channel` at the query
   * level. Used by the Calls page's inbox filter instead of
   * `inboxService.listWithIntegrationsByWorkspace`, which eager-loads all nine
   * credential-bearing integration relations just to discard non-whatsapp rows.
   */
  async listOptionsByWorkspaceAndChannel(input: {
    workspaceId: string
    channel: ChannelType
    tx?: DatabaseClient
  }): Promise<InboxChannelOption[]> {
    const { tx = db } = input
    return await tx.query.inboxModel.findMany({
      columns: { id: true, name: true },
      where: { workspaceId: input.workspaceId, channel: input.channel },
    })
  },

  /**
   * The workspace's connected inboxes as a three-column projection for the
   * analytics Channel and Inbox filters. A disconnected inbox has lost its
   * integration, so it is not offered; its past events still count under "All". `smtp` never carries contact or conversation
   * traffic. No integration relations are loaded.
   */
  async listAnalyticsOptionsByWorkspace(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<InboxAnalyticsOption[]> {
    const { tx = db } = input
    return await tx.query.inboxModel.findMany({
      columns: { id: true, name: true, channel: true },
      where: {
        workspaceId: input.workspaceId,
        status: inboxStatuses.enum.connected,
        channel: { ne: "smtp" },
      },
      orderBy: { name: "asc" },
    })
  },

  /**
   * Marks the inbox as having seen conversation-routing traffic. Throttled in
   * SQL (idempotent): a write happens only when the stored value is missing or
   * older than `THREAD_CONTROL_SEEN_REFRESH_MS`, bounding this to about one
   * write per inbox per day. Returns whether a row was written.
   */
  async touchThreadControlSeen(
    input: { workspaceId: string; inboxId: string; seenAt: Date },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const staleBefore = new Date(
      input.seenAt.getTime() - THREAD_CONTROL_SEEN_REFRESH_MS,
    )
    const rows = await tx
      .update(inboxModel)
      .set({ threadControlSeenAt: input.seenAt })
      .where(
        and(
          eq(inboxModel.id, input.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
          or(
            isNull(inboxModel.threadControlSeenAt),
            lt(inboxModel.threadControlSeenAt, staleBefore),
          ),
        ),
      )
      .returning({ id: inboxModel.id })

    return rows.length > 0
  },

  /**
   * Inbox rows `tenantService.suspend()` paused directly — the pre-backfill
   * fallback in `workspaceLifecycleService.disconnectWorkspaceInbox` writes
   * `Inbox.status = "disconnected"`/`disconnectReason = "tenant_suspended"`
   * straight onto the row when no `Connection` exists yet to route the pause
   * through the engine (the `Inbox` model has no distinct `paused` status).
   * Those rows are invisible to `connectionRepository.listPausedByOwner`, so
   * `tenantService.reactivate` sweeps this list too. Temporary: remove
   * alongside the matching fallback in `tenantService.reactivate` once the
   * `Connection` backfill's `--verify` is 0.
   */
  async listTenantSuspendedWithoutConnectionByOwner(
    input: { ownerId: string },
    tx: DatabaseClient = db,
  ): Promise<InboxModel[]> {
    const rows = await tx
      .select({ inbox: inboxModel })
      .from(inboxModel)
      .innerJoin(workspaceModel, eq(inboxModel.workspaceId, workspaceModel.id))
      .leftJoin(connectionModel, eq(connectionModel.inboxId, inboxModel.id))
      .where(
        and(
          eq(workspaceModel.ownerId, input.ownerId),
          eq(inboxModel.status, "disconnected"),
          eq(inboxModel.disconnectReason, "tenant_suspended"),
          isNull(connectionModel.id),
        ),
      )
    return rows.map((row) => row.inbox)
  },

  /**
   * Mirrors a `Connection` status transition onto `Inbox.status` (and, when
   * going inactive, `disconnectedAt`/`disconnectReason`) — the single write
   * path `ConnectionStateService.mirrorInboxStatus` funnels through instead
   * of touching `inboxModel` itself, so callers decide the exact column
   * values (e.g. omitting `disconnectedAt`/`disconnectReason` to preserve
   * them on a no-op re-assertion) and this just applies them.
   */
  async updateConnectionMirror(
    input: {
      inboxId: string
      workspaceId: string
      values: Partial<
        Pick<
          typeof inboxModel.$inferInsert,
          "status" | "disconnectedAt" | "disconnectReason"
        >
      >
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(inboxModel)
      .set(input.values)
      .where(
        and(
          eq(inboxModel.id, input.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
