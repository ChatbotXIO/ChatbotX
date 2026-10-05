// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findCapiIntegration: vi.fn(),
  saveCapiTestEventCode: vi.fn(),
  provisionDatasetNow: vi.fn(),
  reconnectCapi: vi.fn(),
  disconnectCapi: vi.fn(),
  MetaConversionsException: class MetaConversionsException extends Error {},
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
  MetaConversionsException: mocks.MetaConversionsException,
}))
vi.mock("@chatbotx.io/business", () => ({
  CapiTestEventError: class extends Error {},
  metaConversionsService: {
    saveCapiTestEventCode: mocks.saveCapiTestEventCode,
    provisionDatasetNow: mocks.provisionDatasetNow,
    reconnectCapi: mocks.reconnectCapi,
    disconnectCapi: mocks.disconnectCapi,
  },
}))

const { disconnectCapiFor, provisionCapiDatasetFor, saveCapiTestEventCodeFor } =
  await import("@/features/meta-conversions/lib/capi-operations")

const ref = { workspaceId: "ws-1", integrationId: "3", testEventCode: "T1" }

beforeEach(() => {
  vi.clearAllMocks()
})

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

describe("capi operations: provision and disconnect", () => {
  const channelRef = { workspaceId: "ws-1", integrationId: "3" }

  test("provisioning creates the dataset, then reconnects a disconnected channel", async () => {
    const integration = { id: "3" }
    mocks.findCapiIntegration.mockResolvedValue(integration)

    await provisionCapiDatasetFor({ ...channelRef, channel: "messenger" })

    expect(mocks.provisionDatasetNow).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger", integration }),
    )
    expect(mocks.reconnectCapi).toHaveBeenCalledWith({
      channel: "messenger",
      integration,
    })
  })

  test("a Meta failure while provisioning is surfaced and nothing is reconnected", async () => {
    mocks.findCapiIntegration.mockResolvedValue({ id: "3" })
    mocks.provisionDatasetNow.mockRejectedValueOnce(
      new mocks.MetaConversionsException("(#200) missing permission"),
    )

    await expect(
      provisionCapiDatasetFor({ ...channelRef, channel: "whatsapp" }),
    ).rejects.toMatchObject({
      message: "(#200) missing permission",
      code: "capiRequestFailed",
      httpStatusCode: 400,
    })

    expect(mocks.reconnectCapi).not.toHaveBeenCalled()
  })

  test("provisioning a channel of another workspace is a 404 and calls Meta never", async () => {
    mocks.findCapiIntegration.mockResolvedValue(null)

    await expect(
      provisionCapiDatasetFor({ ...channelRef, channel: "whatsapp" }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.provisionDatasetNow).not.toHaveBeenCalled()
  })

  test("disconnecting marks the channel disconnected", async () => {
    const integration = { id: "3" }
    mocks.findCapiIntegration.mockResolvedValue(integration)

    await disconnectCapiFor({ ...channelRef, channel: "whatsapp" })

    expect(mocks.disconnectCapi).toHaveBeenCalledWith({
      channel: "whatsapp",
      integration,
    })
  })

  test("an Instagram Business Login channel cannot be disconnected (no CAPI)", async () => {
    mocks.findCapiIntegration.mockResolvedValue({ id: "3", type: "instagram" })

    await expect(
      disconnectCapiFor({ ...channelRef, channel: "instagram" }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.disconnectCapi).not.toHaveBeenCalled()
  })
})
