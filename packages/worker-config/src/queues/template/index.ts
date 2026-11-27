import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Template install, sync, uninstall and the auto-update fan-out. Their own
 * queue, consumed with a small bounded concurrency: one save of a widely
 * installed template fans out a sync per installation, and each is a long
 * transaction. On the shared `default` queue that burst would hold its slots
 * and delay the latency-sensitive jobs there (inbound webhooks, appointment
 * reminders) for as long as the burst lasts.
 */
export const TemplateJobAction = {
  installTemplate: "installTemplate",
  syncTemplateInstallation: "syncTemplateInstallation",
  uninstallTemplate: "uninstallTemplate",
  fanOutTemplateUpdate: "fanOutTemplateUpdate",
} as const

export type TemplateJobAction =
  (typeof TemplateJobAction)[keyof typeof TemplateJobAction]

/**
 * Every template job carries an explicit BullMQ priority (lower runs first).
 * Work a person is waiting on (an install, an uninstall, an "Update now")
 * overtakes the background syncs a widely installed template's save fans out,
 * however many of those are queued. Background work is aged, not starved: the
 * sweep re-enqueues what has waited past its grace in the `interactive` lane,
 * which raises the queued job.
 */
export const TemplateJobPriority = {
  interactive: 1,
  background: 10,
} as const

export type TemplateJobLane = keyof typeof TemplateJobPriority

export type TemplateJobInstall = {
  type: typeof TemplateJobAction.installTemplate
  data: {
    installationId: string
    workspaceId: string
  }
}

export type TemplateJobUninstall = {
  type: typeof TemplateJobAction.uninstallTemplate
  data: {
    installationId: string
    workspaceId: string
    /** `TemplateInstallation.uninstallAttempt`: a retry never collides with an old job id. */
    attempt: number
  }
}

export type TemplateJobSyncInstallation = {
  type: typeof TemplateJobAction.syncTemplateInstallation
  data: {
    syncId: string
    workspaceId: string
  }
}

export type TemplateJobFanOutUpdate = {
  type: typeof TemplateJobAction.fanOutTemplateUpdate
  data: {
    templateId: string
    /** The publisher's workspace. */
    workspaceId: string
    version: number
    /** Keyset cursor of the next batch of installations. */
    afterId?: string | null
  }
}

/** The installation row is the outbox; the attempt in the id keeps a retry from being swallowed. */
export const enqueueUninstallTemplate = async (
  data: TemplateJobUninstall["data"],
): Promise<void> => {
  await templateQueue.add(
    TemplateJobAction.uninstallTemplate,
    { type: TemplateJobAction.uninstallTemplate, data },
    {
      jobId: `tpl-uninstall-${data.installationId}-${data.attempt}`,
      priority: TemplateJobPriority.interactive,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}

/**
 * Only a job in the prioritized set is raised. A `waiting` job (one moved back
 * after a stall) is already taken before every prioritized job, so changing
 * its priority would move it behind them.
 */
const PROMOTABLE_STATE = "prioritized"

/**
 * An interactive request for a job already queued as background work keeps
 * that job: BullMQ dedupes the `add` by job id without touching its priority,
 * so it is raised here. A job
 * that started meanwhile has nothing left to promote. A background enqueue
 * never lowers a queued job.
 */
const promoteQueuedJob = async (jobId: string): Promise<void> => {
  const job = await templateQueue.getJob(jobId)
  // `job.priority` is the stored one; `opts.priority` stays what `add` was given.
  if (!job || job.priority === TemplateJobPriority.interactive) {
    return
  }
  if ((await job.getState()) !== PROMOTABLE_STATE) {
    return
  }
  try {
    await job.changePriority({ priority: TemplateJobPriority.interactive })
  } catch (error) {
    // Picked up by a worker between the state read and the change: it runs
    // now, so there is nothing to promote. Anything else is a real failure.
    if ((await job.getState()) === PROMOTABLE_STATE) {
      throw error
    }
  }
}

/**
 * The sync row is the outbox, like the installation row; see
 * `enqueueInstallTemplate`. `lane` is `background` for the auto-update fan-out,
 * `interactive` for a sync a person asked for and for the sweep's retries.
 */
export const enqueueSyncTemplateInstallation = async (
  data: TemplateJobSyncInstallation["data"],
  lane: TemplateJobLane,
): Promise<void> => {
  const jobId = `tpl-sync-${data.syncId}`
  await templateQueue.add(
    TemplateJobAction.syncTemplateInstallation,
    { type: TemplateJobAction.syncTemplateInstallation, data },
    {
      jobId,
      priority: TemplateJobPriority[lane],
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
  if (lane === "interactive") {
    await promoteQueuedJob(jobId)
  }
}

/**
 * One batch of the auto-update fan-out; the job id is per template, version
 * and batch. `lane` is `background` for a save and the next batch, and
 * `interactive` for the sweep's catch-up (aging a fan-out still queued).
 */
export const enqueueFanOutTemplateUpdate = async (
  data: TemplateJobFanOutUpdate["data"],
  lane: TemplateJobLane,
): Promise<void> => {
  const jobId = `tpl-fanout-${data.templateId}-${data.version}-${data.afterId ?? "first"}`
  await templateQueue.add(
    TemplateJobAction.fanOutTemplateUpdate,
    { type: TemplateJobAction.fanOutTemplateUpdate, data },
    {
      jobId,
      priority: TemplateJobPriority[lane],
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
  if (lane === "interactive") {
    await promoteQueuedJob(jobId)
  }
}

/**
 * The installation row is the outbox, so the job carries nothing worth
 * keeping once it finishes or fails: a retained job would make the sweep's
 * next `add()` with the same deterministic id a silent no-op.
 */
export const enqueueInstallTemplate = async (
  data: TemplateJobInstall["data"],
): Promise<void> => {
  await templateQueue.add(
    TemplateJobAction.installTemplate,
    { type: TemplateJobAction.installTemplate, data },
    {
      jobId: `install-template-${data.installationId}`,
      priority: TemplateJobPriority.interactive,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}

export type TemplateJobData =
  | TemplateJobInstall
  | TemplateJobSyncInstallation
  | TemplateJobUninstall
  | TemplateJobFanOutUpdate

export const templateQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<TemplateJobData>(queueNames.enum.template, {
      connection: getQueueConnection(queueNames.enum.template),
      defaultJobOptions,
    })
