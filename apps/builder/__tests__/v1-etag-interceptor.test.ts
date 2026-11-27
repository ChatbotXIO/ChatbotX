// @vitest-environment node

import { describe, expect, test, vi } from "vitest"
import { createV1EtagInterceptor } from "@/lib/orpc/handlers"

const WEAK_SHA256_ETAG_PATTERN = /^W\/"[a-f0-9]{64}"$/

type StandardResponse = {
  body: unknown
  headers: Record<string, string | string[] | undefined>
  status: number
}

type Interceptor = (options: {
  next: () => Promise<{ matched: true; response: StandardResponse }>
  request: {
    headers: Record<string, string | string[] | undefined>
    method: string
    url: URL
  }
}) => Promise<{ matched: true; response: StandardResponse }>

const interceptor = createV1EtagInterceptor() as unknown as Interceptor

const getList = async (
  body: unknown,
  headers: Record<string, string | string[] | undefined> = {},
): Promise<StandardResponse> => {
  const next = vi.fn(async () => ({
    matched: true as const,
    response: {
      body,
      headers: {
        "Content-Length": "19",
        "Content-Type": "application/json",
      },
      status: 200,
    },
  }))
  const result = await interceptor({
    next,
    request: {
      headers,
      method: "GET",
      url: new URL("https://app.example.com/api/v1/conversations"),
    },
  })
  expect(next).toHaveBeenCalledOnce()
  return result.response
}

describe("v1 list ETag interceptor", () => {
  test("returns a weak ETag and private revalidation policy", async () => {
    const response = await getList({ data: [{ id: "1" }] })

    expect(response.status).toBe(200)
    expect(response.headers["Cache-Control"]).toBe("private, no-cache")
    expect(response.headers.ETag).toMatch(WEAK_SHA256_ETAG_PATTERN)
    expect(response.body).toEqual({ data: [{ id: "1" }] })
  })

  test("returns 304 without a body when If-None-Match matches", async () => {
    const initial = await getList({ data: [{ id: "1" }] })
    const etag = initial.headers.ETag
    expect(etag).toBeTruthy()

    const response = await getList(
      { data: [{ id: "1" }] },
      { "If-None-Match": etag },
    )

    expect(response.status).toBe(304)
    expect(response.headers.ETag).toBe(etag)
    expect(response.headers["Content-Length"]).toBeUndefined()
    expect(response.headers["Content-Type"]).toBeUndefined()
    expect(response.body).toBeUndefined()
  })

  test("changes the ETag when the serialized response changes", async () => {
    const first = await getList({ data: [{ id: "1" }] })
    const second = await getList({ data: [{ id: "2" }] })

    expect(second.headers.ETag).not.toBe(first.headers.ETag)
  })
})
