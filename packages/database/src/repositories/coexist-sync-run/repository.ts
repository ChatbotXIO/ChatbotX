import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "../../client"
import {
  coexistSyncRunModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
import type {
  CoexistSyncRunModel,
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "../../types"

export type CoexistChannel = CoexistSyncRunModel["channel"]
export type PullCoexistChannel = Extract<
  CoexistChannel,
  "messenger" | "instagram"
>
export type CoexistRunStatus = CoexistSyncRunModel["status"]
export type CoexistTriggerSource =
  | "popup-enable"
  | "buffer-chain"
  | "sweep-cron"
  | "manual"

export type PickedCoexistRun = Pick<
  CoexistSyncRunModel,
  "id" | "attempts" | "channel" | "integrationId" | "workspaceId"
>

export type CoexistIntegrationRow =
  | (IntegrationMessengerModel & { channel: "messenger" })
  | (IntegrationInstagramModel & { channel: "instagram" })
  | (IntegrationWhatsappModel & { channel: "whatsapp" })

export type CoexistRunCreateInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  triggerSource: CoexistTriggerSource
  tx?: DatabaseClient
}

export type CoexistIntegrationLookupInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  tx?: DatabaseClient
}

export type CoexistRunProgressInput = {
  runId: string
  fields: Partial<
    Pick<
      CoexistSyncRunModel,
      | "status"
      | "currentStep"
      | "currentError"
      | "currentScan"
      | "totalScan"
      | "importedContactCount"
      | "importedMessageCount"
      | "skippedCount"
      | "failedCount"
      | "lastSyncedAt"
      | "lastHeartbeatAt"
      | "finishedAt"
      | "messengerSyncPhase"
      | "currentPageNumber"
      | "lastPhase"
      | "lastChunkOrder"
      | "syncProgress"
    >
  >
  tx?: DatabaseClient
}

export type PickDueRunsInput = {
  batchSize: number
  maxAttempts: number
  tx?: DatabaseClient
}

export type FindResumeCeilingInput = {
  integrationId: string
  channel: PullCoexistChannel
  currentRunId: string
  tx?: DatabaseClient
}

export class CoexistSyncRunRepository {
  async createRun(input: CoexistRunCreateInput): Promise<CoexistSyncRunModel> {
    const { tx = db } = input

    // `onConflictDoNothing` returns no row on conflict WITHOUT raising an error.
    // A raised unique-violation would abort the caller's transaction
    // (CoexistService.enable wraps this in db.transaction), which would then
    // break the idempotent re-select below. The partial unique index on
    // (integrationId, channel) WHERE status = 'init' dedups concurrent enables.
    const [run] = await tx
      .insert(coexistSyncRunModel)
      .values({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        channel: input.channel,
        status: "init",
        triggerSource: input.triggerSource,
      })
      .onConflictDoNothing()
      .returning()

    if (run) {
      return run
    }

    const existing = await this.findActiveInitRun({
      integrationId: input.integrationId,
      channel: input.channel,
      tx,
    })
    if (existing) {
      return existing
    }
    throw new Error(
      "CoexistSyncRun insert conflicted but no active init run found",
    )
  }

  async findActiveInitRun(input: {
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: {
          integrationId: input.integrationId,
          channel: input.channel,
          status: "init",
        },
      })) ?? null
    )
  }

  async findRunById(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
      })) ?? null
    )
  }

  async findWorkspaceOwnerId(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<string | null> {
    const { tx = db } = input
    const row = await tx.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { ownerId: true },
    })
    return row?.ownerId ?? null
  }

  async claimRun(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db } = input
    const [run] = await tx
      .update(coexistSyncRunModel)
      .set({
        status: "running",
        startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.id, input.runId),
          inArray(coexistSyncRunModel.status, ["init", "running"]),
          or(
            ne(coexistSyncRunModel.status, "running"),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
      .returning()

    return run ?? null
  }

  async markMaxAttemptsFailed(input: {
    maxAttempts: number
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError: "Max scheduler retries exceeded",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`${coexistSyncRunModel.attempts} >= ${input.maxAttempts}`,
          inArray(coexistSyncRunModel.status, ["init", "running"]),
        ),
      )
  }

  async pickDueRuns(input: PickDueRunsInput): Promise<PickedCoexistRun[]> {
    const { tx = db } = input
    const picked = await tx.execute<PickedCoexistRun>(sql`
      UPDATE "CoexistSyncRun"
      SET attempts = attempts + 1,
          status = 'init',
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "CoexistSyncRun"
        WHERE (
          (status = 'init' AND "createdAt" < NOW() - INTERVAL '10 seconds')
          OR (status = 'running' AND "lastHeartbeatAt" < NOW() - INTERVAL '1 hour')
        )
        AND attempts < ${input.maxAttempts}
        ORDER BY "createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, attempts, channel, "integrationId", "workspaceId"
    `)

    return picked.rows
  }

  async updateProgress(input: CoexistRunProgressInput): Promise<void> {
    const { tx = db } = input
    await tx
      .update(coexistSyncRunModel)
      .set({ ...input.fields, updatedAt: new Date() })
      .where(eq(coexistSyncRunModel.id, input.runId))
  }

  async markFailed(input: {
    runId: string
    currentError: string
    tx?: DatabaseClient
  }): Promise<void> {
    await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "failed",
        currentError: input.currentError,
        finishedAt: new Date(),
      },
      tx: input.tx,
    })
  }

  async markPartial(input: {
    runId: string
    currentError?: string
    tx?: DatabaseClient
  }): Promise<void> {
    await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "partial",
        currentError: input.currentError,
        finishedAt: new Date(),
      },
      tx: input.tx,
    })
  }

  async markSucceeded(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<void> {
    await this.updateProgress({
      runId: input.runId,
      fields: {
        status: "succeeded",
        finishedAt: new Date(),
      },
      tx: input.tx,
    })
  }

  async findResumeCeiling(input: FindResumeCeilingInput): Promise<Date | null> {
    const { tx = db } = input
    const priorRun = await tx.query.coexistSyncRunModel.findFirst({
      where: {
        integrationId: input.integrationId,
        channel: input.channel,
        status: { in: ["succeeded", "partial"] },
        id: { ne: input.currentRunId },
      },
      orderBy: { startedAt: "desc" },
      columns: { startedAt: true, lastSyncedAt: true, status: true },
    })
    if (!priorRun) {
      return null
    }
    if (priorRun.status === "succeeded") {
      return priorRun.startedAt ?? null
    }
    return priorRun.lastSyncedAt ?? priorRun.startedAt ?? null
  }

  async tearDownActiveRunsForIntegration(input: {
    channel: CoexistChannel
    integrationId: string
    currentError: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError: input.currentError,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coexistSyncRunModel.channel, input.channel),
          eq(coexistSyncRunModel.integrationId, input.integrationId),
          inArray(coexistSyncRunModel.status, ["init", "running"]),
        ),
      )
  }

  findIntegrationForCoexist(
    input: CoexistIntegrationLookupInput,
  ): Promise<CoexistIntegrationRow | null> {
    const { tx = db } = input
    const lookup = integrationLookups[input.channel]
    return lookup({
      tx,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
    })
  }

  /**
   * `aiReadsSyncedHistory` is optional and only written when provided —
   * `undefined` leaves `coexistAiReadsSyncedHistory` untouched (e.g. `disable`
   * must never clear a previously-set value).
   */
  setIntegrationCoexistEnabled(input: {
    channel: CoexistChannel
    workspaceId: string
    integrationId: string
    enabled: boolean
    aiReadsSyncedHistory?: boolean
    tx?: DatabaseClient
  }): Promise<CoexistIntegrationRow | null> {
    const { tx = db } = input
    const update = integrationUpdates[input.channel]
    return update({
      tx,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      enabled: input.enabled,
      aiReadsSyncedHistory: input.aiReadsSyncedHistory,
    })
  }

  /** Read `lastSyncedAt` for phase resume. */
  async findLastSyncedAt(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<{ lastSyncedAt: Date | null } | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: { lastSyncedAt: true },
      })) ?? null
    )
  }

  /**
   * Atomically increments the given counters (`sql\`col + N\`` — NOT a
   * read-modify-write, which would reintroduce a lost-update race across the
   * two concurrent phase workers) while also setting the given plain-value
   * fields.
   */
  async incrementProgress(input: {
    runId: string
    increments: Partial<
      Record<
        | "currentScan"
        | "importedContactCount"
        | "importedMessageCount"
        | "skippedCount"
        | "failedCount",
        number
      >
    >
    fields?: CoexistRunProgressInput["fields"]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db, runId, increments, fields } = input
    const incrementSet: Record<string, unknown> = {}
    for (const [key, amount] of Object.entries(increments)) {
      if (amount === undefined) {
        continue
      }
      const column =
        coexistSyncRunModel[key as keyof typeof coexistSyncRunModel]
      incrementSet[key] = sql`${column} + ${amount}`
    }

    await tx
      .update(coexistSyncRunModel)
      .set({ ...incrementSet, ...fields, updatedAt: new Date() })
      .where(eq(coexistSyncRunModel.id, runId))
  }

  /** Init-row read (attempts/currentError/messengerSyncPhase) before claim. */
  async findInitState(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<Pick<
    CoexistSyncRunModel,
    "attempts" | "currentError" | "messengerSyncPhase"
  > | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: {
          attempts: true,
          currentError: true,
          messengerSyncPhase: true,
        },
      })) ?? null
    )
  }

  /**
   * Optimistic claim with a stale-heartbeat fallback, used by
   * `messenger-sync.ts` and `whatsapp-flush.ts`. Deliberately does NOT
   * include `claimRun`'s `inArray(status, ["init","running"])` guard — both
   * callers reclaim `failed`/`partial` runs on retry, so adding that guard
   * would silently break retry recovery. `touchUpdatedAt` distinguishes the
   * two callers' SET clauses (messenger-sync also bumps `updatedAt`;
   * whatsapp-flush does not) — do not unify beyond this flag.
   */
  async claimRunForSync(input: {
    runId: string
    touchUpdatedAt: boolean
    tx?: DatabaseClient
  }): Promise<CoexistSyncRunModel | null> {
    const { tx = db, runId, touchUpdatedAt } = input
    const [run] = await tx
      .update(coexistSyncRunModel)
      .set({
        status: "running",
        startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
        lastHeartbeatAt: new Date(),
        ...(touchUpdatedAt ? { updatedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(coexistSyncRunModel.id, runId),
          or(
            ne(coexistSyncRunModel.status, "running"),
            lt(
              coexistSyncRunModel.lastHeartbeatAt,
              sql`NOW() - INTERVAL '10 minutes'`,
            ),
          ),
        ),
      )
      .returning()

    return run ?? null
  }

  /** Terminal-status derivation counters (importedMessages/skipped/failed). */
  async findTerminalCounters(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<Pick<
    CoexistSyncRunModel,
    "importedMessageCount" | "skippedCount" | "failedCount"
  > | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: {
          importedMessageCount: true,
          skippedCount: true,
          failedCount: true,
        },
      })) ?? null
    )
  }

  /**
   * Newest non-terminal (init/running) run for an integration + channel,
   * ordered by `createdAt` desc. Do NOT reuse `findActiveInitRun` — it
   * filters `status === "init"` only and has no ordering.
   */
  async findNewestLiveRunId(input: {
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<string | null> {
    const { tx = db } = input
    const run = await tx.query.coexistSyncRunModel.findFirst({
      where: {
        integrationId: input.integrationId,
        channel: input.channel,
        status: { in: ["init", "running"] },
      },
      orderBy: { createdAt: "desc" },
      columns: { id: true },
    })
    return run?.id ?? null
  }

  /** Resume-state read (9 columns) after claim, for `whatsapp-flush.ts`. */
  async findFlushResumeState(input: {
    runId: string
    tx?: DatabaseClient
  }): Promise<Pick<
    CoexistSyncRunModel,
    | "workspaceId"
    | "currentPageNumber"
    | "attempts"
    | "importedContactCount"
    | "importedMessageCount"
    | "skippedCount"
    | "failedCount"
    | "currentScan"
    | "currentError"
  > | null> {
    const { tx = db } = input
    return (
      (await tx.query.coexistSyncRunModel.findFirst({
        where: { id: input.runId },
        columns: {
          workspaceId: true,
          currentPageNumber: true,
          attempts: true,
          importedContactCount: true,
          importedMessageCount: true,
          skippedCount: true,
          failedCount: true,
          currentScan: true,
          currentError: true,
        },
      })) ?? null
    )
  }
}

type IntegrationAccessInput = {
  tx: DatabaseClient
  workspaceId: string
  integrationId: string
}

type IntegrationUpdateInput = IntegrationAccessInput & {
  enabled: boolean
  /** Undefined = leave `coexistAiReadsSyncedHistory` untouched. */
  aiReadsSyncedHistory?: boolean
}

const integrationLookups = {
  messenger: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    const row = await tx.query.integrationMessengerModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "messenger" } : null
  },
  instagram: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    // Admit both Instagram types — native login (`type: "instagram"`) and
    // Facebook-linked (`type: "facebook"`). The worker selects the matching
    // coexist adapter by `row.type`.
    const row = await tx.query.integrationInstagramModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "instagram" } : null
  },
  whatsapp: async ({
    tx,
    workspaceId,
    integrationId,
  }: IntegrationAccessInput): Promise<CoexistIntegrationRow | null> => {
    const row = await tx.query.integrationWhatsappModel.findFirst({
      where: { id: integrationId, workspaceId },
    })
    return row ? { ...row, channel: "whatsapp" } : null
  },
} satisfies Record<
  CoexistChannel,
  (input: IntegrationAccessInput) => Promise<CoexistIntegrationRow | null>
>

const integrationUpdates = {
  messenger: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationMessengerModel.id, integrationId),
          eq(integrationMessengerModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "messenger" } : null
  },
  instagram: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationInstagramModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationInstagramModel.id, integrationId),
          eq(integrationInstagramModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "instagram" } : null
  },
  whatsapp: async ({
    tx,
    workspaceId,
    integrationId,
    enabled,
    aiReadsSyncedHistory,
  }: IntegrationUpdateInput): Promise<CoexistIntegrationRow | null> => {
    const [row] = await tx
      .update(integrationWhatsappModel)
      .set({
        coexistEnabled: enabled,
        ...(aiReadsSyncedHistory === undefined
          ? {}
          : { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }),
      })
      .where(
        and(
          eq(integrationWhatsappModel.id, integrationId),
          eq(integrationWhatsappModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return row ? { ...row, channel: "whatsapp" } : null
  },
} satisfies Record<
  CoexistChannel,
  (input: IntegrationUpdateInput) => Promise<CoexistIntegrationRow | null>
>

export const coexistSyncRunRepository = new CoexistSyncRunRepository()
