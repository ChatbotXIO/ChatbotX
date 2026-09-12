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

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the dynamic images public router under the media scope", () => {
  expect(scopeArgAtImport).toBe("media")
})

describe("GET /v1/dynamic-images", () => {
  const procedure = findProcedure("GET", "/v1/dynamic-images")

  test("lists dynamic images for the token workspace", async () => {
    const result = { data: [dynamicImage], pageCount: 1 }
    dynamicImageService.list.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 2, perPage: 25, name: "Welcome" },
      }),
    ).resolves.toEqual(result)

    expect(dynamicImageService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      name: "Welcome",
    })
  })
})

describe("GET /v1/dynamic-images/{id}", () => {
  const procedure = findProcedure("GET", "/v1/dynamic-images/{id}")

  test("gets a dynamic image for the token workspace", async () => {
    dynamicImageService.find.mockResolvedValueOnce(dynamicImage)

    await expect(
      procedure.handler?.({ context, input: { id: "image-1" } }),
    ).resolves.toEqual(dynamicImage)

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
    ).resolves.toEqual(dynamicImage)

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
    ).resolves.toEqual(dynamicImage)

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
    ).resolves.toEqual({ ...dynamicImage, enabled: false })

    expect(dynamicImageService.setEnabled).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "image-1" },
      false,
    )
  })
})
