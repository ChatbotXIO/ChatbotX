// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: { create: mockCreate },
}))

const { keywordsAdapter } = await import("../src/template/adapters/keywords")

const buildContext = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

describe("keywordsAdapter", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("resolves an inbound keyword into its inbound-scoped folder, not an outbound folder of the same name", async () => {
    mockCreate.mockResolvedValue({ id: "created-keyword-id" })

    const ctx = buildContext({
      folder: new Map([
        ["src-inbound-folder", "target-inbound-folder"],
        ["src-outbound-folder", "target-outbound-folder"],
      ]),
      flow: new Map([["src-flow", "target-flow"]]),
    })

    await keywordsAdapter.insert(ctx, [
      {
        sourceId: "src-keyword",
        type: "inbound",
        text: "Welcome!",
        keywords: ["hi", "hello"],
        flowId: "src-flow",
        folderId: "src-inbound-folder",
      },
    ])

    expect(mockCreate).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        type: "inbound",
        folderId: "target-inbound-folder",
        flowId: "target-flow",
      }),
      ctx.tx,
    )
  })

  test("warns and nulls the folder reference when the folder never resolved", async () => {
    mockCreate.mockResolvedValue({ id: "created-keyword-id" })
    const ctx = buildContext({})

    await keywordsAdapter.insert(ctx, [
      {
        sourceId: "src-keyword",
        type: "outbound",
        text: null,
        keywords: ["promo"],
        flowId: null,
        folderId: "src-missing-folder",
      },
    ])

    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "folder",
        value: "src-missing-folder",
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ folderId: null }),
      ctx.tx,
    )
  })
})
