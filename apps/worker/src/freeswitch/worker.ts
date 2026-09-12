// FreeSWITCH ESL worker. Deployed on the FreeSWITCH host
// (ESL is loopback-only, `RECORDINGS_DIR` is a local volume), one process
// per node, leader-elected via `distributedLock.runExclusive` so only one
// replica per node holds the ESL subscription and the node's two BullMQ
// consumers at a time.
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  DEFAULT_FREESWITCH_NODE_ID,
  parseFreeswitchNodes,
} from "@chatbotx.io/business"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import {
  getFreeswitchRecordingsQueue,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import type { Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { createFreeswitchApiConsumer } from "./api-consumer"
import { EslConnection } from "./esl-connection"
import { FreeswitchEventBatcher } from "./event-batcher"
import { applyFreeswitchKeepRule } from "./keep-rule"
import { reconcileFreeswitchNode } from "./reconciliation"
import { createRecordingConsumer } from "./recording-consumer"
import { parseRecordingFilePath, sweepRecordingFiles } from "./recording-sweep"

const LEADER_LOCK_TTL_SECONDS = 30
const RECONCILE_INTERVAL_MS = 60_000
const RECONNECT_BACKOFF_MS = 5000

const SUBSCRIBED_EVENTS = [
  "CHANNEL_ANSWER",
  "CHANNEL_HANGUP_COMPLETE",
  "RECORD_STOP",
  "CUSTOM",
  "cbx::call",
  "sofia::register",
  "sofia::unregister",
  "sofia::expire",
  "sofia::gateway_state",
]

let shuttingDown = false

const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000

/** The currently-held ESL leader run, if any — set inside `runLeaderDuties` so `shutdown` can trigger and await its cleanup. */
let activeLeader: { connection: EslConnection; done: Promise<void> } | undefined

/** `show channels as json` → the set of live channel uuids on this node. */
const listLiveUuids = async (
  connection: EslConnection,
): Promise<ReadonlySet<string>> => {
  const reply = await connection.api("show channels as json")
  try {
    const parsed: unknown = JSON.parse(reply)
    const rows =
      parsed && typeof parsed === "object" && "rows" in parsed
        ? (parsed as { rows?: unknown }).rows
        : []
    if (!Array.isArray(rows)) {
      return new Set()
    }
    return new Set(
      rows
        .map((row) =>
          row && typeof row === "object" && "uuid" in row
            ? String((row as { uuid: unknown }).uuid)
            : undefined,
        )
        .filter((uuid): uuid is string => Boolean(uuid)),
    )
  } catch {
    // `show channels` returned something unparseable (e.g. "0 total") —
    // treat as "no live channels" rather than crash the reconcile tick.
    return new Set()
  }
}

const runReconcileAndSweepTick = async (
  nodeId: string,
  connection: EslConnection,
): Promise<void> => {
  try {
    const integrations =
      await integrationWhatsappRepository.listProvisionedForXml(nodeId)
    const integrationIds = integrations.map((row) => row.id)
    const live = await listLiveUuids(connection)

    const { finalized } = await reconcileFreeswitchNode(
      { integrationIds },
      {
        listLiveUuids: async () => live,
        listActiveByIntegrationIds: (ids) =>
          whatsappCallRepository.listActiveByIntegrationIds(ids),
        finalizeById: (input) => whatsappCallRepository.finalizeById(input),
      },
    )
    if (finalized > 0) {
      logger.info(
        { nodeId, finalized },
        "FreeSWITCH reconciliation finalized stale calls",
      )
    }

    const { enqueued } = await sweepRecordingFiles({
      listFiles: () => listRecordingFiles(),
      isLiveUuid: (uuid) => live.has(uuid),
      enqueueUpload: async (file) => {
        await getFreeswitchRecordingsQueue(nodeId).add(
          "callRecordingUpload",
          {
            type: "callRecordingUpload",
            data: {
              channel: "whatsapp",
              nodeId,
              workspaceId: file.workspaceId,
              integrationId: "",
              rootUuid: file.uuid,
              path: file.path,
            },
          },
          { jobId: `rec-upload-${file.uuid}` },
        )
      },
    })
    if (enqueued > 0) {
      logger.info(
        { nodeId, enqueued },
        "FreeSWITCH recording sweep enqueued uploads",
      )
    }
  } catch (error) {
    logger.error(
      { err: error, nodeId },
      "FreeSWITCH reconcile/sweep tick failed",
    )
  }
}

/** Lists `.ogg` files under `RECORDINGS_DIR/wa/<workspaceId>/` older than the sweep threshold. */
const listRecordingFiles = async () => {
  const root = join(env.RECORDINGS_DIR, "wa")

  const files: Array<{
    path: string
    uuid: string
    workspaceId: string
    mtimeMs: number
  }> = []

  const workspaceDirs = await readdir(root, { withFileTypes: true }).catch(
    () => [],
  )
  for (const dirEntry of workspaceDirs) {
    if (!dirEntry.isDirectory()) {
      continue
    }
    const dirPath = join(root, dirEntry.name)
    const entries = await readdir(dirPath, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of entries) {
      if (!(entry.isFile() && entry.name.endsWith(".ogg"))) {
        continue
      }
      // Enqueued in FreeSWITCH's own path namespace (same as RECORD_STOP's
      // Record-File-Path) so the consumer applies one mapping for both.
      const path = join(env.FS_RECORDINGS_DIR, "wa", dirEntry.name, entry.name)
      const parsed = parseRecordingFilePath(path)
      if (!parsed) {
        continue
      }
      // Stat the file where THIS process sees it (the local mount).
      const localPath = join(dirPath, entry.name)
      const stats = await stat(localPath).catch(() => undefined)
      if (!stats) {
        continue
      }
      files.push({
        path,
        uuid: parsed.uuid,
        workspaceId: parsed.workspaceId,
        mtimeMs: stats.mtimeMs,
      })
    }
  }
  return files
}

/** Runs while this replica holds the ESL leader lock — resolves when the connection closes (or `shutdown` closes it). */
const runLeaderDuties = async (nodeId: string): Promise<void> => {
  const connection = await EslConnection.connect({
    host: env.FS_ESL_HOST,
    port: env.FS_ESL_PORT,
    password: env.FS_ESL_PASSWORD ?? "",
  })
  logger.info({ nodeId }, "FreeSWITCH ESL leader connected")

  const done = runLeaderDutiesWithConnection(nodeId, connection).finally(() => {
    activeLeader = undefined
  })
  activeLeader = { connection, done }
  await done
}

const runLeaderDutiesWithConnection = async (
  nodeId: string,
  connection: EslConnection,
): Promise<void> => {
  let batcher: FreeswitchEventBatcher | undefined
  let unsubscribe: (() => void) | undefined
  let apiWorker: Worker | undefined
  let recordingWorker: Worker | undefined
  let reconcileTimer: NodeJS.Timeout | undefined

  try {
    await connection.subscribe(SUBSCRIBED_EVENTS)

    batcher = new FreeswitchEventBatcher(
      nodeId,
      (jobs) => integrationQueue.addBulk(jobs),
      {
        onFlushError: (error, droppedEvents) =>
          logger.error(
            {
              err: error,
              nodeId,
              droppedEvents,
              pending: batcher?.pendingCount,
            },
            "FreeSWITCH ESL event batch could not be enqueued; retrying with backoff",
          ),
      },
    )

    // The socket callback never awaits — `push` is synchronous.
    unsubscribe = connection.onEvent((frame) => {
      const kept = applyFreeswitchKeepRule(frame.headers)
      if (kept) {
        batcher?.push(kept)
      }
    })

    apiWorker = createFreeswitchApiConsumer(nodeId, connection)
    recordingWorker = createRecordingConsumer(nodeId, {
      localDir: env.RECORDINGS_DIR,
      freeswitchDir: env.FS_RECORDINGS_DIR,
    })

    reconcileTimer = setInterval(() => {
      runReconcileAndSweepTick(nodeId, connection).catch(() => undefined)
    }, RECONCILE_INTERVAL_MS)
    // Run once immediately so a stale-since-last-restart backlog is caught
    // without waiting a full tick.
    runReconcileAndSweepTick(nodeId, connection).catch(() => undefined)

    await new Promise<void>((resolve) => {
      connection.onClose(() => resolve())
    })
  } finally {
    // Runs on a normal ESL close AND on `shutdown()` forcing the connection
    // closed early (or any step above throwing) — buffered events and
    // in-flight jobs are always drained before the process exits.
    if (reconcileTimer) {
      clearInterval(reconcileTimer)
    }
    unsubscribe?.()
    await apiWorker?.close()
    await recordingWorker?.close()
    await batcher?.close()
  }
  logger.warn({ nodeId }, "FreeSWITCH ESL leader connection closed")
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function startFreeswitchWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap freeswitch worker")
    process.exit(1)
  }

  const nodeId = env.FS_NODE_ID || DEFAULT_FREESWITCH_NODE_ID
  // Validates FS_NODES at boot even though this process only ever acts as
  // `nodeId` — a malformed value should fail loudly at startup, not silently
  // during the first xml_curl lookup.
  parseFreeswitchNodes(env.FS_NODES, {
    sipDomain: env.FS_SIP_DOMAIN ?? "",
    wssUrl: env.FS_WSS_URL ?? "",
    turnUrl: env.TURN_URL ?? "",
  })

  while (!shuttingDown) {
    try {
      await distributedLock.runExclusive({
        key: `freeswitch-esl:${nodeId}`,
        timeoutInSeconds: LEADER_LOCK_TTL_SECONDS,
        fn: () => runLeaderDuties(nodeId),
      })
    } catch (error) {
      logger.error(
        { err: error, nodeId },
        "FreeSWITCH ESL leader attempt failed",
      )
    }
    if (!shuttingDown) {
      await sleep(RECONNECT_BACKOFF_MS)
    }
  }
}

startFreeswitchWorker()

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  logger.info({ signal }, "FreeSWITCH worker shutting down")
  try {
    if (activeLeader) {
      // Closing the connection resolves `runLeaderDutiesWithConnection`'s
      // `onClose` await, which runs its `finally` cleanup (unsubscribe,
      // close the API/recording workers, flush the batcher) — the same path
      // a normal ESL disconnect takes.
      activeLeader.connection.close()
      await Promise.race([activeLeader.done, sleep(SHUTDOWN_DRAIN_TIMEOUT_MS)])
    }
    process.exit(0)
  } catch (err) {
    logger.error({ err }, "FreeSWITCH worker error during shutdown")
    process.exit(1)
  }
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "FreeSWITCH worker uncaught exception")
})

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "FreeSWITCH worker unhandled rejection")
})

export { RECORDING_SWEEP_MIN_AGE_MS } from "./recording-sweep"
export { RECONCILE_INTERVAL_MS }
