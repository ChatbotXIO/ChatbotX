import type { useTranslations } from "next-intl"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { downloadFlowExport } from "../src/features/flows/lib/download-flow-export"

const flow = {
  id: "flow-1",
  workspaceId: "ws-1",
  name: "My Flow",
}

const t = vi.fn((key: string) => key) as unknown as ReturnType<
  typeof useTranslations
>

function mockResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    blob: vi.fn().mockResolvedValue(new Blob(["{}"])),
  } as unknown as Response
}

describe("downloadFlowExport", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url")
    revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
  })

  test("downloads using the filename from Content-Disposition", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse(200, {
        "Content-Disposition": 'attachment; filename="custom-flow.json"',
      }),
    )

    await downloadFlowExport(flow, t)

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url")
  })

  test("falls back to the flow name when Content-Disposition is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200))

    await downloadFlowExport(flow, t)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  test("shows notPublished toast and skips download on 409", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(409))

    await downloadFlowExport(flow, t)

    expect(t).toHaveBeenCalledWith("flows.export.notPublished")
    expect(clickSpy).not.toHaveBeenCalled()
  })

  test("shows failed toast and skips download on server error", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(500))

    await downloadFlowExport(flow, t)

    expect(t).toHaveBeenCalledWith("flows.export.failed")
    expect(clickSpy).not.toHaveBeenCalled()
  })

  test("shows failed toast when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"))

    await downloadFlowExport(flow, t)

    expect(t).toHaveBeenCalledWith("flows.export.failed")
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
