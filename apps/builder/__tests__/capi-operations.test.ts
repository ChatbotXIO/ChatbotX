// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findCapiIntegration: vi.fn(),
  saveCapiTestEventCode: vi.fn(),
}))

vi.mock("@/features/meta-conversions/lib/find-capi-integration", () => ({
  findCapiIntegration: mocks.findCapiIntegration,
}))
vi.mock("@/features/meta-conversions/lib/provision-capi-dataset", () => ({
  capiDatasetProvisioner: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  getDataset: vi.fn(),
  sendConversionEvent: vi.fn(),
  MetaConversionsException: class extends Error {},
}))
vi.mock("@chatbotx.io/business", () => ({
  CapiTestEventError: class extends Error {},
  metaConversionsService: {
    saveCapiTestEventCode: mocks.saveCapiTestEventCode,
  },
}))

const { saveCapiTestEventCodeFor } = await import(
  "@/features/meta-conversions/lib/capi-operations"
)

const ref = { workspaceId: "ws-1", integrationId: "3", testEventCode: "T1" }

describe("capi operations: channel lookup", () => {
  test("a missing channel is a 404 notFound", async () => {
    mocks.findCapiIntegration.mockResolvedValue(null)

    await expect(
      saveCapiTestEventCodeFor({ ...ref, channel: "messenger" }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
  })

  test("an Instagram Business Login channel has no CAPI and reads as not found", async () => {
    mocks.findCapiIntegration.mockResolvedValue({ id: "3", type: "instagram" })

    await expect(
      saveCapiTestEventCodeFor({ ...ref, channel: "instagram" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.saveCapiTestEventCode).not.toHaveBeenCalled()
  })

  test("a Facebook-linked Instagram channel proceeds", async () => {
    mocks.findCapiIntegration.mockResolvedValue({ id: "3", type: "facebook" })

    await saveCapiTestEventCodeFor({ ...ref, channel: "instagram" })

    expect(mocks.saveCapiTestEventCode).toHaveBeenCalledTimes(1)
  })
})
