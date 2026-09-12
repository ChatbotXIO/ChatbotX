import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: ProcedureHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const dynamicImageService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  setEnabled: vi.fn(),
  resolveBackgroundUrls: vi.fn(),
}
vi.mock("@chatbotx.io/business/dynamic-image", () => ({ dynamicImageService }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {},
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy = new Proxy(Object.create(null), {
    get: () => proxy,
  })
  return { db: proxy }
})

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => "https://broker.example.test",
}))

await import("@/features/dynamic-images/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1" } }
const dynamicImageData = { width: 100, height: 100, elements: [] }
const dynamicImage = {
  id: "image-1",
  workspaceId: "workspace-1",
  name: "Welcome image",
  customFieldId: null,
  data: dynamicImageData,
  backgroundUrl: "public/dynamic-images/background.png",
  enabled: true,
}
const resolvedBackgroundUrl =
  "https://cdn.example.test/dynamic-images/background.png"
const expectedImageUrl =
  "https://broker.example.test/dynamic-images?dynamicImageId=image-1&userId={{user_id}}"

const {
  workspaceId: _dynamicImageWorkspaceId,
  ...dynamicImageWithoutWorkspaceId
} = dynamicImage
const publicDynamicImage = {
  ...dynamicImageWithoutWorkspaceId,
  backgroundUrl: resolvedBackgroundUrl,
  imageUrl: expectedImageUrl,
}
// `resolveBackgroundUrls` is a real business-service method; the test stubs
// its shape instead of re-deriving it, so each assertion below drives the
// same `{ ...row, backgroundUrl }` mapping the real implementation performs.
const resolveBackgroundUrlsStub = (
  rows: (typeof dynamicImage)[],
): (Omit<typeof dynamicImage, "backgroundUrl"> & {
  backgroundUrl: string | null
})[] => rows.map((row) => ({ ...row, backgroundUrl: resolvedBackgroundUrl }))

beforeEach(() => {
  vi.clearAllMocks()
  dynamicImageService.resolveBackgroundUrls.mockImplementation(
    async ({ rows }: { rows: (typeof dynamicImage)[] }) =>
      resolveBackgroundUrlsStub(rows),
  )
})

test("registers the dynamic images public router under the media scope", () => {
  expect(scopeArgAtImport).toBe("media")
})

describe("GET /v1/dynamic-images", () => {
  const procedure = findProcedure("GET", "/v1/dynamic-images")

  test("lists dynamic images for the token workspace with resolved background/trigger urls", async () => {
    const result = { data: [dynamicImage], pageCount: 1 }
    dynamicImageService.list.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 2, perPage: 25, name: "Welcome" },
      }),
    ).resolves.toEqual({
      data: [publicDynamicImage],
      pageCount: 1,
    })

    expect(dynamicImageService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      name: "Welcome",
    })
    expect(dynamicImageService.resolveBackgroundUrls).toHaveBeenCalledTimes(1)
    expect(dynamicImageService.resolveBackgroundUrls).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      rows: [dynamicImage],
    })
  })

  test("resolves background urls once per request, not once per row", async () => {
    const rows = [dynamicImage, { ...dynamicImage, id: "image-2" }]
    dynamicImageService.list.mockResolvedValueOnce({ data: rows, pageCount: 1 })

    await procedure.handler?.({ context, input: {} })

    expect(dynamicImageService.resolveBackgroundUrls).toHaveBeenCalledTimes(1)
  })
})

describe("GET /v1/dynamic-images/{id}", () => {
  const procedure = findProcedure("GET", "/v1/dynamic-images/{id}")

  test("gets a dynamic image with resolved background/trigger urls", async () => {
    dynamicImageService.find.mockResolvedValueOnce(dynamicImage)

    await expect(
      procedure.handler?.({ context, input: { id: "image-1" } }),
    ).resolves.toEqual(publicDynamicImage)

    expect(dynamicImageService.find).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "image-1",
    })
  })

  test("surfaces the service not-found error", async () => {
    dynamicImageService.find.mockRejectedValueOnce(
      new Error("Dynamic image not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Dynamic image not found")
  })
})

describe("POST /v1/dynamic-images", () => {
  const procedure = findProcedure("POST", "/v1/dynamic-images")

  test("creates a dynamic image in the token workspace", async () => {
    dynamicImageService.create.mockResolvedValueOnce(dynamicImage)

    await expect(
      procedure.handler?.({
        context,
        input: {
          name: "Welcome image",
          customFieldId: null,
          data: dynamicImageData,
        },
      }),
    ).resolves.toEqual(publicDynamicImage)

    expect(dynamicImageService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Welcome image",
      customFieldId: null,
      data: dynamicImageData,
    })
  })
})

describe("PUT /v1/dynamic-images/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/dynamic-images/{id}")

  test("updates a dynamic image in the token workspace", async () => {
    dynamicImageService.update.mockResolvedValueOnce(dynamicImage)

    await expect(
      procedure.handler?.({
        context,
        input: {
          id: "image-1",
          name: "Welcome image",
          customFieldId: null,
          data: dynamicImageData,
        },
      }),
    ).resolves.toEqual(publicDynamicImage)

    expect(dynamicImageService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "image-1",
      name: "Welcome image",
      customFieldId: null,
      data: dynamicImageData,
    })
  })
})

describe("DELETE /v1/dynamic-images/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/dynamic-images/{id}")

  test("deletes a dynamic image in the token workspace", async () => {
    dynamicImageService.delete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "image-1" } }),
    ).resolves.toBeUndefined()

    expect(dynamicImageService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "image-1",
    })
  })
})

describe("PATCH /v1/dynamic-images/{id}/enabled", () => {
  const procedure = findProcedure("PATCH", "/v1/dynamic-images/{id}/enabled")

  test("sets whether a dynamic image is enabled in the token workspace", async () => {
    dynamicImageService.setEnabled.mockResolvedValueOnce({
      ...dynamicImage,
      enabled: false,
    })

    await expect(
      procedure.handler?.({
        context,
        input: { id: "image-1", enabled: false },
      }),
    ).resolves.toEqual({ ...publicDynamicImage, enabled: false })

    expect(dynamicImageService.setEnabled).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "image-1" },
      false,
    )
  })
})
