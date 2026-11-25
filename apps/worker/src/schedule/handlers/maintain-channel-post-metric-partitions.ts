import { maintainChannelPostMetricPartitions as maintain } from "@chatbotx.io/business"
import { logger } from "../../lib/logger"

// Keeps `ChannelPostMetricDaily` monthly partitions ahead of incoming data and
// drops months past retention (see `maintainChannelPostMetricPartitions` in
// `@chatbotx.io/business`). System maintenance, not workspace-scoped, so no
// blocked-owner guard (AGENTS.md invariant 15 covers workspace-scoped jobs).
export async function maintainChannelPostMetricPartitions(): Promise<void> {
  try {
    await maintain()
  } catch (err) {
    logger.error({ err }, "[maintainChannelPostMetricPartitions] failed")
  }
}
