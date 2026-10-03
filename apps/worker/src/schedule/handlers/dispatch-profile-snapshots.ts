import {
  contactInboxService,
  serializeProfileSnapshotCursor,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { distributedStore } from "@chatbotx.io/redis"
import { enqueueProfileSnapshotJobs } from "../../integration/handlers/profile-snapshot/queue"
import { logger } from "../../lib/logger"

const PAGE_SIZE = 100
const MAX_PAGES_PER_RUN = 20
const RECOVERY_CURSOR_TTL_SECONDS = 60 * 60 * 24
const DUE_CURSOR_KEY = "schedule:profile-snapshots:due-cursor"
const EXHAUSTED_CURSOR_KEY = "schedule:profile-snapshots:exhausted-cursor"

type SnapshotRecoveryRow = {
  contactInboxId: string
  inboxId: string
  nextAttemptAt: Date | null
  workspaceId: string
}

/**
 * Re-drives durable profile snapshot intent after a Redis enqueue failure or
 * a worker crash. It walks by ContactInbox id so a blocked workspace cannot
 * prevent later rows from being considered in this run.
 */
export const dispatchProfileSnapshots = async (): Promise<void> => {
  await finishExhaustedSnapshots()
  await enqueueDueSnapshots()
}

const finishExhaustedSnapshots = async (): Promise<void> => {
  await recoverSnapshotPages({
    cursorKey: EXHAUSTED_CURSOR_KEY,
    list: (cursor) =>
      contactInboxService.listExhaustedProfileSnapshots({
        cursor,
        limit: PAGE_SIZE,
      }),
    process: async (row) => {
      await withBlockedOwnerGuard(row.workspaceId, async () => {
        const completed = await contactInboxService.completeProfileSnapshot({
          ...row,
          onlyIfLeaseExpired: true,
          outcome: "failed",
          snapshot: {
            followsBusiness: null,
            businessFollowsContact: null,
            accountVerified: null,
            followerCount: null,
          },
        })
        if (completed) {
          logger.error(
            { ...row, outcome: "failed", reason: "retryExhausted" },
            "Profile snapshot retry budget exhausted during recovery",
          )
        }
      })
    },
  })
}

const enqueueDueSnapshots = async (): Promise<void> => {
  await recoverSnapshotPages({
    cursorKey: DUE_CURSOR_KEY,
    list: async (cursor) =>
      await contactInboxService.listDueProfileSnapshots({
        cursor,
        limit: PAGE_SIZE,
      }),
    process: async (row) => {
      await withBlockedOwnerGuard(row.workspaceId, async () => {
        await enqueueProfileSnapshotJobs({
          contactInboxIds: [row.contactInboxId],
          inboxId: row.inboxId,
          workspaceId: row.workspaceId,
        }).catch((err) => {
          logger.warn(
            { err, ...row },
            "Profile snapshot recovery enqueue failed; intent remains pending",
          )
        })
      })
    },
  })
}

const recoverSnapshotPages = async <Row extends SnapshotRecoveryRow>(props: {
  cursorKey: string
  list: (cursor: string | undefined) => Promise<Row[]>
  process: (row: Row) => Promise<void>
}): Promise<void> => {
  let cursor =
    (await distributedStore.get<string>(props.cursorKey)) ?? undefined
  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const rows = await props.list(cursor)
    if (rows.length === 0) {
      await distributedStore.delete(props.cursorKey)
      return
    }
    for (const row of rows) {
      await props.process(row)
    }

    if (rows.length < PAGE_SIZE) {
      await distributedStore.delete(props.cursorKey)
      return
    }
    const lastRow = rows.at(-1)
    cursor = lastRow ? serializeProfileSnapshotCursor(lastRow) : undefined
    if (!cursor) {
      return
    }
    await distributedStore.put(
      props.cursorKey,
      cursor,
      RECOVERY_CURSOR_TTL_SECONDS,
    )
  }
}
