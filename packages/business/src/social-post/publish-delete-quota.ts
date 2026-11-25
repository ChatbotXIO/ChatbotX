import type { SocialPublisher } from "@chatbotx.io/utils/social-publisher"
import { logger } from "../logger"
import { logSafe } from "./publish-common"

/**
 * The delete quota (Threads: 100 per rolling 24 hours, `delete_quota_usage` /
 * `delete_config`) for a removal. True when it is used up; a removal is then
 * refused with a clear error and a person asks again later. Not cached: a
 * removal is a rare, deliberate request.
 */
export const deleteQuotaExhausted = async (input: {
  accessToken: string
  destinationExternalId: string
  publisher: Pick<SocialPublisher, "getDeleteLimit">
}): Promise<boolean> => {
  const { getDeleteLimit } = input.publisher
  if (!getDeleteLimit) {
    return false
  }
  try {
    const live = await getDeleteLimit({
      accessToken: input.accessToken,
      destinationExternalId: input.destinationExternalId,
    })
    return live !== null && live.quotaUsage >= live.quotaTotal
  } catch (err) {
    logger.warn(
      { err: logSafe(err) },
      "social-post pace: reading the delete quota failed",
    )
    return false
  }
}
