import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappAuthValue } from "../src/schema"

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: {
      get: getMock,
    },
  }
})

const { listFlows, listMessageTemplates } = await import("../src/api/waba")

const DEFAULT_MAX_PAGES = 20
const MESSAGE_TEMPLATE_MAX_PAGES = 70

const response = (body: unknown) => ({
  json: vi.fn().mockResolvedValue(body),
})

const auth = {
  version: "v23.0",
  tokens: { accessToken: "token" },
  metadata: { wabaId: "waba" },
} as WhatsappAuthValue

/**
 * Answers every request with one row and a `next` pointing at a fresh URL, so
 * the walk only ends when the page cap stops it.
 */
const respondWithEndlessPages = () => {
  getMock.mockImplementation((url: string) =>
    response({
      data: [{ id: `row-${getMock.mock.calls.length}` }],
      paging: { next: `${url}&after=${getMock.mock.calls.length}` },
    }),
  )
}

/**
 * Answers with `pageCount` pages and then a final page carrying no `next`.
 */
const respondWithPages = (pageCount: number) => {
  getMock.mockImplementation((url: string) => {
    const page = getMock.mock.calls.length
    return response({
      data: [{ id: `row-${page}` }],
      paging: page < pageCount ? { next: `${url}&after=${page}` } : undefined,
    })
  })
}

describe("listMessageTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Meta lets a verified portfolio hold 6,000 templates, far past the shared
  // default cap. Stopping at that default would fail the sync outright for the
  // biggest accounts, which is exactly who has the most templates to sync.
  test("keeps paging past the default cap so a large WABA still syncs", async () => {
    const pageCount = DEFAULT_MAX_PAGES + 5
    respondWithPages(pageCount)

    const result = await listMessageTemplates(auth)

    expect(result.data).toHaveLength(pageCount)
    expect(getMock).toHaveBeenCalledTimes(pageCount)
  })

  test("fails instead of returning a truncated template list", async () => {
    respondWithEndlessPages()

    await expect(listMessageTemplates(auth)).rejects.toThrow(
      `Graph pagination exceeded ${MESSAGE_TEMPLATE_MAX_PAGES} pages`,
    )
    expect(getMock).toHaveBeenCalledTimes(MESSAGE_TEMPLATE_MAX_PAGES)
  })
})

describe("listFlows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("fails instead of returning a truncated flow list", async () => {
    respondWithEndlessPages()

    await expect(listFlows({ auth })).rejects.toThrow(
      `Graph pagination exceeded ${DEFAULT_MAX_PAGES} pages`,
    )
    expect(getMock).toHaveBeenCalledTimes(DEFAULT_MAX_PAGES)
  })
})
