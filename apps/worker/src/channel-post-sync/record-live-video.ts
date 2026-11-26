import { channelPostService } from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type { IntegrationJobLiveVideoStatusChange } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { integrationService } from "../services/integrations"
import { resolvePostIntegration } from "./resolve-post-integration"

/**
 * A `live_videos` webhook named a broadcast: re-reads it with the Page's token
 * and records what the read says (never what the webhook said), so a forged or
 * stale delivery cannot flip a post. A broadcast that is scheduled, unpublished
 * or has no post id records nothing. A failed read propagates: the job retries
 * a few times, then the periodic sync and the stale-live re-read settle it.
 */
export async function recordLiveVideoStatusChange(
  data: IntegrationJobLiveVideoStatusChange["data"],
): Promise<void> {
  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      data.integrationType as IntegrationType,
      data.integrationIdentifier,
    )
  const { channel, ctx, integration, integrationId, sourceAccountId } =
    await resolvePostIntegration({
      channel: inbox.channel,
      inboxId: inbox.id,
      workspaceId: inbox.workspaceId,
    })
  if (!integration.hasChannelHandler("post", "readLiveBroadcast")) {
    return
  }

  // Taken before the read, so a slower write is never mistaken for newer.
  const observedAt = new Date()
  const broadcast = await integration.runChannelHandler(
    "post",
    "readLiveBroadcast",
    { ctx, data: { liveVideoId: data.liveVideoId } },
  )
  if (!broadcast) {
    logger.info(
      { liveVideoId: data.liveVideoId, status: data.status },
      "live-video: nothing to record",
    )
    return
  }
  await channelPostService.recordLiveObservation({
    caption: broadcast.caption,
    channel,
    externalPostId: broadcast.externalPostId,
    inboxId: inbox.id,
    integrationId,
    observedAt,
    permalink: broadcast.permalink,
    publishedAt: broadcast.publishedAt,
    source: "webhook",
    sourceAccountId,
    status: broadcast.liveStatus,
    workspaceId: inbox.workspaceId,
  })
}
