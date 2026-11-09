import { beforeEach, expect, test, vi } from "vitest"
import { z } from "zod"

const kyMock = vi.hoisted(() => vi.fn())
vi.mock("ky", () => ({ default: kyMock }))

const { woocommerceListAll } = await import("../src/client")

const credentials = {
  siteUrl: "https://shop.example.com",
  consumerKey: "ck",
  consumerSecret: "cs",
  authMode: "header" as const,
}

const pageResponse = (items: number[], totalPages: string | null) =>
  new Response(JSON.stringify(items.map((id) => ({ id }))), {
    status: 200,
    headers: totalPages ? { "X-WP-TotalPages": totalPages } : {},
  })

beforeEach(() => {
  kyMock.mockReset()
})

test("reads every page the store reports, in order", async () => {
  kyMock
    .mockResolvedValueOnce(pageResponse([1, 2], "3"))
    .mockResolvedValueOnce(pageResponse([3, 4], "3"))
    .mockResolvedValueOnce(pageResponse([5], "3"))
  const seen: number[] = []
  await woocommerceListAll(
    credentials,
    { path: "/products" },
    z.object({ id: z.number() }),
    (items) => {
      seen.push(...items.map((item) => item.id))
      return Promise.resolve()
    },
  )
  expect(seen).toEqual([1, 2, 3, 4, 5])
  expect(
    kyMock.mock.calls.map((call) =>
      (call[1] as { searchParams: URLSearchParams }).searchParams.get("page"),
    ),
  ).toEqual(["1", "2", "3"])
})

test("reads one page when the store sends no page count", async () => {
  kyMock.mockResolvedValueOnce(pageResponse([1], null))
  const onPage = vi.fn(() => Promise.resolve())
  await woocommerceListAll(
    credentials,
    { path: "/coupons" },
    z.object({ id: z.number() }),
    onPage,
  )
  expect(kyMock).toHaveBeenCalledTimes(1)
  expect(onPage).toHaveBeenCalledTimes(1)
})
