import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const metricsMessageSample =
  /chatbotx_messages_total\{(?:direction="in",channel="webchat"|channel="webchat",direction="in")\} 1/

const sentry = vi.hoisted(() => {
  const scope = {
    setExtra: vi.fn(),
    setFingerprint: vi.fn(),
    setTag: vi.fn(),
  }
  return {
    captureException: vi.fn(),
    init: vi.fn(),
    scope,
    withScope: vi.fn((callback: (scope: typeof scope) => void) =>
      callback(scope),
    ),
  }
})

vi.mock("@sentry/node", () => sentry)

import { classifyError } from "../src/classify-error"
import { incrementMessage } from "../src/metrics"
import { type MetricsServer, startMetricsServer } from "../src/metrics-server"
import {
  captureException,
  initErrorTracking,
  resetErrorTrackingForTests,
} from "../src/sentry"

describe("classifyError", () => {
  test.each([
    [{ code: "42601" }, "code_bug"],
    [{ code: "42703" }, "code_bug"],
    [{ code: "23502" }, "code_bug"],
    [{ code: "40001" }, "db_transient"],
    [
      Object.assign(new Error("SQL failed"), { cause: { code: "42601" } }),
      "code_bug",
    ],
  ])("classifies %o as %s", (error, expected) => {
    expect(classifyError(error)).toBe(expected)
  })

  test("classifies a provider ChannelError without treating generic SDK errors as provider failures", () => {
    expect(
      classifyError(
        new ChannelError(
          "Provider refused request",
          ChannelErrorCategory.RATE_LIMITED,
          {
            httpStatusCode: 429,
          },
        ),
      ),
    ).toBe("third_party")
    expect(classifyError({ httpStatusCode: 422 })).toBe("unknown")
  })
})

describe("metrics server", () => {
  let metricsServer: MetricsServer | null
  let originalMetricsPort: string | undefined

  beforeEach(() => {
    originalMetricsPort = process.env.METRICS_PORT
    delete process.env.METRICS_PORT
  })

  afterEach(async () => {
    await metricsServer?.close()
    metricsServer = null
    if (originalMetricsPort === undefined) {
      delete process.env.METRICS_PORT
      return
    }
    process.env.METRICS_PORT = originalMetricsPort
  })

  test("does not listen when METRICS_PORT is absent", async () => {
    await expect(startMetricsServer()).resolves.toBeNull()
  })

  test("serves the Prometheus exposition format", async () => {
    incrementMessage({ channel: "webchat", direction: "in" })
    metricsServer = await startMetricsServer({ port: 0 })

    const response = await fetch(
      `http://127.0.0.1:${metricsServer?.port}/metrics`,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/plain")
    await expect(response.text()).resolves.toMatch(metricsMessageSample)
  })
})

describe("Sentry error tracking", () => {
  let originalDsn: string | undefined

  beforeEach(() => {
    originalDsn = process.env.SENTRY_DSN
    delete process.env.SENTRY_DSN
    resetErrorTrackingForTests()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN
      return
    }
    process.env.SENTRY_DSN = originalDsn
  })

  test("is a no-op without a DSN", () => {
    expect(initErrorTracking({ service: "worker" })).toBe(false)
    expect(
      captureException({ error: new Error("failure"), errorClass: "unknown" }),
    ).toBe(false)
    expect(sentry.init).not.toHaveBeenCalled()
  })

  test("redacts request bodies and deduplicates matching failures", () => {
    process.env.SENTRY_DSN = "https://public@example.invalid/1"

    expect(initErrorTracking({ service: "worker" })).toBe(true)
    const options = sentry.init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>
    }
    const event = options.beforeSend({
      extra: { token: "secret" },
      request: { data: { message: "private message", token: "secret" } },
    })

    expect(event).toMatchObject({
      extra: { token: "[redacted]" },
      request: { data: "[redacted]" },
    })
    const input = {
      error: new Error("database query 123456 failed"),
      errorClass: "code_bug" as const,
      extra: {
        bullboardUrl:
          "https://app.example.test/developer/queues/queue/integration/job-1",
      },
      queue: "integration",
    }
    expect(captureException(input)).toBe(true)
    expect(captureException(input)).toBe(false)
    expect(sentry.scope.setExtra).toHaveBeenCalledWith(
      "bullboardUrl",
      "https://app.example.test/developer/queues/queue/integration/job-1",
    )
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })
})
