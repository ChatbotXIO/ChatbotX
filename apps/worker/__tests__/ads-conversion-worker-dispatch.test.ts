import type { AdsConversionJobData } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const workerState = vi.hoisted(() => ({
  handleEvaluateTemplateSent: vi.fn(),
  handleEvaluateConversionTrigger: vi.fn(),
  handleSendConversionEvent: vi.fn(),
  handleSyncRetargetAudience: vi.fn(),
}))

vi.mock(
  "../src/integration/handlers/ads-conversion/evaluate-template-sent",
  () => ({
    handleEvaluateTemplateSent: (...args: unknown[]) =>
      workerState.handleEvaluateTemplateSent(...args),
  }),
)

vi.mock(
  "../src/integration/handlers/ads-conversion/evaluate-conversion-trigger",
  () => ({
    handleEvaluateConversionTrigger: (...args: unknown[]) =>
      workerState.handleEvaluateConversionTrigger(...args),
  }),
)

vi.mock(
  "../src/integration/handlers/ads-conversion/send-conversion-event",
  () => ({
    handleSendConversionEvent: (...args: unknown[]) =>
      workerState.handleSendConversionEvent(...args),
  }),
)

vi.mock(
  "../src/integration/handlers/ads-conversion/sync-retarget-audience",
  () => ({
    handleSyncRetargetAudience: (...args: unknown[]) =>
      workerState.handleSyncRetargetAudience(...args),
  }),
)

const { dispatchAdsConversionJob } = await import(
  "../src/integration/handlers/ads-conversion/registry"
)

beforeEach(() => {
  workerState.handleEvaluateTemplateSent.mockReset()
  workerState.handleEvaluateConversionTrigger.mockReset()
  workerState.handleSendConversionEvent.mockReset()
  workerState.handleSyncRetargetAudience.mockReset()
})

describe("dispatchAdsConversionJob (ads-conversion sub-registry)", () => {
  test("routes evaluateTemplateSent jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "evaluateTemplateSent",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      },
    }

    await dispatchAdsConversionJob(data)

    expect(workerState.handleEvaluateTemplateSent).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("routes evaluateConversionTrigger jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "evaluateConversionTrigger",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "tagApplied", tagId: "tag-1" },
      },
    }

    await dispatchAdsConversionJob(data)

    expect(workerState.handleEvaluateConversionTrigger).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("routes sendConversionEvent jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "sendConversionEvent",
      data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
    }

    await dispatchAdsConversionJob(data)

    expect(workerState.handleSendConversionEvent).toHaveBeenCalledWith(
      data.data,
    )
  })

  test("routes syncRetargetAudience jobs to their handler", async () => {
    const data: AdsConversionJobData = {
      type: "syncRetargetAudience",
      data: {
        workspaceId: "ws-1",
        customAudienceId: "audience-1",
        segment: "leads",
        since: "2026-01-01",
        until: "2026-01-31",
      },
    }

    await dispatchAdsConversionJob(data)

    expect(workerState.handleSyncRetargetAudience).toHaveBeenCalledWith(
      data.data,
    )
  })
})
