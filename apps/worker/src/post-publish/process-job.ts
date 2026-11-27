import {
  socialPostFeedRunner,
  socialPostPartPublishService,
  socialPostPublishService,
  socialPostRemoveService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import {
  PostPublishJobAction,
  type PostPublishJobData,
} from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { socialPublishers } from "./publishers"

/** A job queued before delayed checks existed has no `expectedDueAtMs`. */
const toOptionalDate = (ms: number | undefined): Date | undefined =>
  ms === undefined ? undefined : new Date(ms)

/**
 * One attempt for one destination of a composed post: publish it, or take it
 * down from its network. A blocked workspace is a bare return: the target stays
 * as it is and nothing is retried or failed.
 */
export async function processPostPublishJob(
  job: PostPublishJobData,
): Promise<void> {
  const { workspaceId } = job.data
  await withBlockedOwnerGuard(workspaceId, async () => {
    await runJobWithAuditContext(
      { source: `post-publish:${job.type}`, workspaceId },
      async () => {
        if (job.type === PostPublishJobAction.checkTarget) {
          await socialPostPublishService.runTargetCheck(
            {
              expectedDueAt: toOptionalDate(job.data.expectedDueAtMs),
              id: job.data.socialPostTargetId,
              leaseUntil: new Date(job.data.leaseUntilMs),
              workspaceId,
            },
            socialPublishers,
          )
          return
        }
        if (job.type === PostPublishJobAction.checkPart) {
          await socialPostPartPublishService.runPartCheck(
            {
              expectedDueAt: toOptionalDate(job.data.expectedDueAtMs),
              id: job.data.socialPostPartId,
              leaseUntil: new Date(job.data.leaseUntilMs),
              workspaceId,
            },
            socialPublishers,
          )
          return
        }
        if (job.type === PostPublishJobAction.publishPart) {
          await socialPostPartPublishService.runPart(
            { id: job.data.socialPostPartId, workspaceId },
            socialPublishers,
          )
          return
        }
        if (job.type === PostPublishJobAction.runFeed) {
          const result = await socialPostFeedRunner.runFeed({
            id: job.data.feedId,
            workspaceId,
          })
          // The runner logs what a check did; this line ties the outcome to the job.
          logger.info(
            { feedId: job.data.feedId, result, workspaceId },
            "post-publish: feed job finished",
          )
          return
        }
        if (job.type === PostPublishJobAction.removeTarget) {
          await socialPostRemoveService.runRemoval(
            { id: job.data.socialPostTargetId, workspaceId },
            socialPublishers,
          )
          return
        }
        await socialPostPublishService.runTarget(
          { id: job.data.socialPostTargetId, workspaceId },
          socialPublishers,
        )
      },
    )
  })
}
