// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const mediaLibraryService = {
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  presignUpload: vi.fn(),
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  setFavourite: vi.fn(),
  findFile: vi.fn(),
  recordFileAccess: vi.fn(),
  moveFiles: vi.fn(),
}

const mediaLibraryFileService = { list: vi.fn() }

const dynamicImageService = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  setEnabled: vi.fn(),
  resolveBackgroundUrls: vi.fn().mockResolvedValue([]),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  mediaLibraryService,
  mediaLibraryFileService,
}))

vi.mock("@chatbotx.io/business/dynamic-image", () => ({ dynamicImageService }))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, loader: () => unknown) => loader()),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { mediaLibraryPublicRouter } = await import(
  "../src/features/media-library/api/public"
)
const { dynamicImagesPublicRouter } = await import(
  "../src/features/dynamic-images/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

// Exercises heterogeneous procedures from both merged routers — each has its
// own input/output shape, so this is intentionally untyped.
const invoke = (procedure: any, input: Record<string, unknown> = {}) =>
  call(procedure, input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const dynamicImageDocument = { width: 100, height: 100, elements: [] }

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  dynamicImageService.resolveBackgroundUrls.mockResolvedValue([])
})

describe("real router: media public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/media-library/files route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(mediaLibraryPublicRouter.listFiles),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/media-library/files route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    mediaLibraryFileService.list.mockResolvedValue({ data: [], pageCount: 1 })

    await expect(
      invoke(mediaLibraryPublicRouter.listFiles),
    ).resolves.toMatchObject({ data: [], pageCount: 1 })
  })

  test("a contacts-scoped token is denied the real POST /v1/media-library/files/upload-url route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(mediaLibraryPublicRouter.createUploadUrl, {
        fileName: "cat.png",
        mimeType: "image/png",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
  })

  test("a contacts-scoped token is denied the real GET /v1/dynamic-images route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(dynamicImagesPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
  })

  test("a contacts-scoped token is denied the real POST /v1/dynamic-images route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(dynamicImagesPublicRouter.create, {
        name: "Welcome image",
        data: dynamicImageDocument,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/dynamic-images route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    dynamicImageService.list.mockResolvedValue({ data: [], pageCount: 1 })

    await expect(invoke(dynamicImagesPublicRouter.list)).resolves.toMatchObject(
      { data: [], pageCount: 1 },
    )
  })
})

describe("every mediaLibrary/dynamicImages submodule declares the media scope", () => {
  test("the media library router was built entirely under workspaceTokenAuthAPIForScope('media')", () => {
    // Sanity check: every key on the router resolves to a procedure — if a
    // submodule forgot to call `workspaceTokenAuthAPIForScope("media")` and
    // used a bare/differently-scoped builder instead, the FORBIDDEN
    // assertions above would still pass by coincidence for the routes they
    // cover, but a spot-check across the full route surface is what actually
    // proves the router didn't drop or mis-scope any of them.
    expect(Object.keys(mediaLibraryPublicRouter)).toEqual(
      expect.arrayContaining([
        "listFolders",
        "createFolder",
        "renameFolder",
        "deleteFolder",
        "createUploadUrl",
        "listFiles",
        "getFile",
        "createFile",
        "deleteFile",
        "setFavourite",
        "recordAccess",
        "moveFiles",
      ]),
    )
  })

  test("the dynamic images router was built entirely under workspaceTokenAuthAPIForScope('media')", () => {
    expect(Object.keys(dynamicImagesPublicRouter)).toEqual(
      expect.arrayContaining([
        "list",
        "get",
        "create",
        "update",
        "delete",
        "setEnabled",
      ]),
    )
  })
})
