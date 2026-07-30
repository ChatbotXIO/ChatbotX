import { beforeEach, describe, expect, test, vi } from "vitest"
import { MetaCatalogException } from "../src/exception"

const request = vi.fn()

vi.mock("ky", () => ({
  default: {
    create: () => ({
      get: (...args: unknown[]) => request(...args),
      post: (...args: unknown[]) => request(...args),
    }),
  },
  isHTTPError: (error: unknown) =>
    (error as { name?: string } | null)?.name === "HTTPError",
}))

const { metaCatalogGraphClient } = await import("../src/lib/http-client")

/** The shape ky throws: the body is already consumed onto `data`. */
const graphFailure = (error: unknown) =>
  Object.assign(new Error("Bad Request"), {
    name: "HTTPError",
    data: { error },
    response: { status: 400 },
  })

describe("metaCatalogGraphClient error mapping", () => {
  beforeEach(() => {
    request.mockReset()
  })

  test("keeps both the developer message and the sentence Meta wrote for the user", async () => {
    request.mockRejectedValue(
      graphFailure({
        message: "Invalid parameter",
        error_user_title: "Catalog not eligible",
        error_user_msg:
          "This catalog is not connected to a commerce account yet.",
        code: 100,
        error_subcode: 33,
        fbtrace_id: "trace-1",
      }),
    )

    await expect(
      metaCatalogGraphClient.get("v24.0/catalog-1/products"),
    ).rejects.toMatchObject({
      message:
        "Invalid parameter — This catalog is not connected to a commerce account yet.",
      fbTraceId: "trace-1",
      graphCode: 100,
      graphSubcode: 33,
      statusCode: 400,
    })
  })

  test("falls back to the user title when Meta sent no user message", async () => {
    request.mockRejectedValue(
      graphFailure({ message: "Unsupported post request", code: 190 }),
    )

    await expect(
      metaCatalogGraphClient.post("v24.0/catalog-1/items_batch"),
    ).rejects.toThrow("Unsupported post request")
  })

  test("prints a repeated sentence only once", async () => {
    request.mockRejectedValue(
      graphFailure({
        message: "Token expired",
        error_user_msg: "Token expired",
      }),
    )

    await expect(
      metaCatalogGraphClient.get("v24.0/me/businesses"),
    ).rejects.toThrow(new MetaCatalogException("Token expired", 400))
  })

  test("names the failing edge when the body carries no error at all", async () => {
    request.mockRejectedValue(
      Object.assign(new Error("Bad Request"), {
        name: "HTTPError",
        data: {},
        response: { status: 500 },
      }),
    )

    await expect(
      metaCatalogGraphClient.get("v24.0/catalog-1/products"),
    ).rejects.toThrow("Meta Graph request failed: v24.0/catalog-1/products")
  })

  test("rethrows a non-HTTP failure untouched", async () => {
    const offline = new Error("fetch failed")
    request.mockRejectedValue(offline)

    await expect(metaCatalogGraphClient.get("v24.0/me")).rejects.toBe(offline)
  })
})
