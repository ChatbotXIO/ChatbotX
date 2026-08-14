import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  metaConversionsGraphClient: {
    get: (...args: unknown[]) => mocks.get(...args),
    post: (...args: unknown[]) => mocks.post(...args),
  },
  graphAuthHeaders: (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  }),
}))

const { ensureDataset, getDataset } = await import("../src/apis/dataset")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Meta Conversions dataset API", () => {
  test("creates or reads a Page dataset on the page dataset edge", async () => {
    mocks.post.mockResolvedValue({ data: { id: "dataset-page-1" } })

    await expect(
      ensureDataset({
        resourceType: "page",
        resourceId: "page-1",
        accessToken: "token-1",
        version: "v24.0",
      }),
    ).resolves.toBe("dataset-page-1")

    expect(mocks.post).toHaveBeenCalledWith("v24.0/page-1/dataset", {
      headers: { Authorization: "Bearer token-1" },
    })
  })

  test("creates or reads an Instagram dataset on the IG user dataset edge", async () => {
    mocks.post.mockResolvedValue({ data: { dataset: { id: "dataset-ig-1" } } })

    await expect(
      ensureDataset({
        resourceType: "igUser",
        resourceId: "ig-user-1",
        accessToken: "token-1",
      }),
    ).resolves.toBe("dataset-ig-1")

    expect(mocks.post).toHaveBeenCalledWith("v24.0/ig-user-1/dataset", {
      headers: { Authorization: "Bearer token-1" },
    })
  })

  test("creates or reads a WhatsApp dataset on the WABA dataset edge", async () => {
    mocks.post.mockResolvedValue({ data: { id: "dataset-waba-1" } })

    await expect(
      ensureDataset({
        resourceType: "waba",
        resourceId: "waba-1",
        accessToken: "token-1",
        version: "v24.0",
      }),
    ).resolves.toBe("dataset-waba-1")

    expect(mocks.post).toHaveBeenCalledWith("v24.0/waba-1/dataset", {
      headers: { Authorization: "Bearer token-1" },
    })
  })

  test("validates dataset access by reading the dataset id", async () => {
    mocks.get.mockResolvedValue({ data: { id: "dataset-1" } })

    await expect(
      getDataset({
        datasetId: "dataset-1",
        accessToken: "token-1",
        version: "v24.0",
      }),
    ).resolves.toBe("dataset-1")

    expect(mocks.get).toHaveBeenCalledWith("v24.0/dataset-1", {
      headers: { Authorization: "Bearer token-1" },
      searchParams: { fields: "id" },
    })
  })
})
