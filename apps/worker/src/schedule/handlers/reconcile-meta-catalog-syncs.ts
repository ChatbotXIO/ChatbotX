import { metaCatalogSyncRunService } from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"

const LOCK_KEY = "schedule:reconcile-meta-catalog-syncs"
const LOCK_TTL_SECONDS = 55
const STALE_AFTER_MS = 2 * 60 * 1000

export const reconcileMetaCatalogSyncs = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const runs = await metaCatalogSyncRunService.listRecoverablePushRuns(
        new Date(Date.now() - STALE_AFTER_MS),
      )
      const cycle = Math.floor(Date.now() / 60_000)

      await defaultQueue.addBulk(
        runs.map((run) =>
          run.submissionLeaseId
            ? {
                name: DefaultJobAction.submitMetaCatalogSync,
                data: {
                  type: DefaultJobAction.submitMetaCatalogSync,
                  data: {
                    workspaceId: run.workspaceId,
                    runId: run.id,
                    recovery: true,
                  },
                },
                opts: {
                  jobId: `mc-recover-submit-${run.id}-${cycle}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              }
            : {
                name: DefaultJobAction.checkMetaCatalogSync,
                data: {
                  type: DefaultJobAction.checkMetaCatalogSync,
                  data: {
                    workspaceId: run.workspaceId,
                    runId: run.id,
                    attempt: 0,
                  },
                },
                opts: {
                  jobId: `mc-recover-check-${run.id}-${cycle}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              },
        ),
      )

      return { reconciled: runs.length }
    },
  })
