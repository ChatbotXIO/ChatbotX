import {
  MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY,
  MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY,
} from "@chatbotx.io/business"
import {
  FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS,
  MESSENGER_ECHO_MAX_ATTACHMENTS,
} from "@chatbotx.io/integration-messenger"
import { DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS } from "@chatbotx.io/utils/media-download"
import { MESSENGER_ECHO_DEFAULTS } from "@chatbotx.io/worker-config/messenger-echo-env"
import { describe, expect, test } from "vitest"
import {
  calculateMessengerEchoProcessingTtlSeconds,
  MESSENGER_ECHO_PROCESSING_LEASE_SAFETY_MULTIPLIER,
} from "../src/integration/handlers/messenger-echo-processing-lease"

describe("Messenger echo processing lease", () => {
  test("covers the analytic worst-case runtime for the default batch size", () => {
    const batchSize = MESSENGER_ECHO_DEFAULTS.flushBatch
    const analyticBoundMs =
      Math.ceil(batchSize / MESSENGER_ECHO_DEFAULT_PROFILE_CONCURRENCY) *
        FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS +
      Math.ceil(
        (batchSize * MESSENGER_ECHO_MAX_ATTACHMENTS) /
          MESSENGER_ECHO_DEFAULT_ATTACHMENT_CONCURRENCY,
      ) *
        DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS
    const leaseMs = calculateMessengerEchoProcessingTtlSeconds(batchSize) * 1000

    expect(leaseMs).toBeGreaterThanOrEqual(
      analyticBoundMs * MESSENGER_ECHO_PROCESSING_LEASE_SAFETY_MULTIPLIER,
    )
  })
})
