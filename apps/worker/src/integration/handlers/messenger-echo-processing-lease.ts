import {
  MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY,
  MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY,
} from "@chatbotx.io/business"
import {
  FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS,
  MESSENGER_ECHO_MAX_ATTACHMENTS,
} from "@chatbotx.io/integration-messenger"
import { DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS } from "@chatbotx.io/utils/media-download"

export const MESSENGER_ECHO_PROCESSING_LEASE_SAFETY_MULTIPLIER = 2

export const calculateMessengerEchoProcessingTtlSeconds = (
  batchSize: number,
): number => {
  const profileWaves = Math.ceil(
    batchSize / MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY,
  )
  const attachmentWaves = Math.ceil(
    (batchSize * MESSENGER_ECHO_MAX_ATTACHMENTS) /
      MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY,
  )
  const analyticBoundMs =
    profileWaves * FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS +
    attachmentWaves * DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS

  return Math.ceil(
    (analyticBoundMs * MESSENGER_ECHO_PROCESSING_LEASE_SAFETY_MULTIPLIER) /
      1000,
  )
}
