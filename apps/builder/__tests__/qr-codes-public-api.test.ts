import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
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
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const qrCodeService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ qrCodeService }))

vi.mock("@/features/qr-codes/schema/public", async () => {
  const { z } = await import("zod")
  const schema = z.any()
  return {
    publicListQrCodesRequest: schema,
    publicListQrCodesResponse: schema,
    publicGetQrCodeRequest: schema,
    publicQrCodeResponse: schema,
    publicCreateQrCodeRequest: schema,
    publicCreateQrCodeResponse: schema,
    publicUpdateQrCodeRequest: schema,
    publicDeleteQrCodeRequest: schema,
  }
})

await import("@/features/qr-codes/api/public")

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
const tokenContext = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the QR codes public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/qr-codes", () => {
  const procedure = findProcedure("GET", "/v1/qr-codes")

  test("lists QR codes in the token workspace", async () => {
    const response = { data: [{ id: "qr-1" }], pageCount: 1 }
    qrCodeService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: tokenContext,
        input: { page: 1, perPage: 50, keyword: "welcome" },
      }),
    ).resolves.toEqual(response)

    expect(qrCodeService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      keyword: "welcome",
    })
  })
})

describe("GET /v1/qr-codes/{id}", () => {
  const procedure = findProcedure("GET", "/v1/qr-codes/{id}")

  test("gets a QR code from the token workspace", async () => {
    const response = { id: "qr-1" }
    qrCodeService.findOrFail.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: tokenContext,
        input: { id: "qr-1" },
      }),
    ).resolves.toEqual(response)

    expect(qrCodeService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "qr-1",
    })
  })

  test("surfaces the service not-found error", async () => {
    qrCodeService.findOrFail.mockRejectedValueOnce(
      new Error("QR Code not found"),
    )

    await expect(
      procedure.handler?.({
        context: tokenContext,
        input: { id: "missing" },
      }),
    ).rejects.toThrow("QR Code not found")
  })
})

describe("POST /v1/qr-codes", () => {
  const procedure = findProcedure("POST", "/v1/qr-codes")

  test("creates a QR code in the token workspace", async () => {
    qrCodeService.create.mockResolvedValueOnce({ id: "qr-1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { name: "welcome", flowId: "flow-1", size: 300 },
    })

    expect(qrCodeService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "welcome", flowId: "flow-1", size: 300 },
      duplicateNameMessage: "QR Code name already exists",
    })
  })
})

describe("PUT /v1/qr-codes/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/qr-codes/{id}")

  test("updates a QR code in the token workspace", async () => {
    qrCodeService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { id: "qr-1", name: "welcome", size: 400 },
    })

    expect(qrCodeService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "qr-1" },
      { name: "welcome", size: 400 },
      "QR Code name already exists",
    )
  })
})

describe("DELETE /v1/qr-codes/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/qr-codes/{id}")

  test("deletes a QR code in the token workspace", async () => {
    qrCodeService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { id: "qr-1" },
    })

    expect(qrCodeService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["qr-1"],
    })
  })
})
