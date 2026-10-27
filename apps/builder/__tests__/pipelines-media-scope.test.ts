// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Contract (docs + procedure descriptions): attaching an EXISTING media-library
// file needs only the `pipelines` scope; uploading a new file
// (`mediaLibrary.createUploadUrl` / `createFile`) additionally needs `media`.

const mocks = vi.hoisted(() => {
  const autoFns = () => {
    const cache: Record<string, ReturnType<typeof vi.fn>> = {}
    return new Proxy(cache, {
      get: (target, prop: string) => {
        if (prop === "then") {
          return
        }
        target[prop] ??= vi.fn().mockResolvedValue(undefined)
        return target[prop]
      },
    })
  }
  return {
    findWorkspaceByTokenHash: vi.fn(),
    isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
    getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
    isAtLimit: vi.fn().mockResolvedValue(false),
    assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
    pipelineItemContentService: autoFns(),
    mediaLibraryService: autoFns(),
  }
})

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    ...actual,
    workspaceApiTokenService: {
      findWorkspaceByTokenHash: mocks.findWorkspaceByTokenHash,
    },
    isWorkspaceScheduledForDeletion: mocks.isWorkspaceScheduledForDeletion,
    userQuotaService: { getAccessState: mocks.getAccessState },
    quotaEnforcementService: { isAtLimit: mocks.isAtLimit },
    mediaLibraryService: mocks.mediaLibraryService,
    mediaLibraryFileService: {},
  }
})

vi.mock("@chatbotx.io/business/pipeline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/business/pipeline")>()
  return {
    ...actual,
    pipelineItemContentService: mocks.pipelineItemContentService,
  }
})

vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited: mocks.assertApiNotRateLimited,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { pipelinesPublicRouter } = await import(
  "../src/features/pipelines/api/public"
)
const { mediaLibraryPublicRouter } = await import(
  "../src/features/media-library/api/public"
)

const TOKEN = "cbx_ws_fixture"
const ATTACH_NAME = /^addAttachment/

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full", scopes },
})

const invoke = (procedure: unknown, input: unknown) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const router = pipelinesPublicRouter as Record<string, unknown>
const attachProcedure = router.addAttachment

const attachInput = {
  id: "1",
  itemId: "2",
  mediaLibraryFileIds: ["30"],
  mediaLibraryFileId: "30",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isWorkspaceScheduledForDeletion.mockReturnValue(false)
  mocks.getAccessState.mockResolvedValue({ blocked: false })
  mocks.isAtLimit.mockResolvedValue(false)
  mocks.assertApiNotRateLimited.mockResolvedValue(undefined)
})

const attachCalls = () =>
  Object.entries(mocks.pipelineItemContentService)
    .filter(([name]) => ATTACH_NAME.test(name))
    .flatMap(([, fn]) => (fn as ReturnType<typeof vi.fn>).mock.calls)

describe("pipeline attachments and the media scope", () => {
  test("the attach procedure exists on the public router", () => {
    expect(attachProcedure).toBeDefined()
  })

  test("a token with only the pipelines scope can attach an existing media file", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue(authResult(["pipelines"]))

    await invoke(attachProcedure, attachInput)

    const calls = attachCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toMatchObject({
      workspaceId: "ws-1",
      pipelineId: "1",
      itemId: "2",
      scope: { kind: "workspaceToken" },
    })
  })

  test("a token with only the pipelines scope cannot request an upload url", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue(authResult(["pipelines"]))

    await expect(
      invoke(mediaLibraryPublicRouter.createUploadUrl, {
        fileName: "a.png",
        contentType: "image/png",
        size: 10,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
    expect(mocks.mediaLibraryService.createUploadUrl).not.toHaveBeenCalled()
  })

  test("a token with only the pipelines scope cannot register a media file", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue(authResult(["pipelines"]))

    await expect(
      invoke(mediaLibraryPublicRouter.createFile, {
        path: "x/a.png",
        name: "a.png",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'media' scope",
    })
    expect(mocks.mediaLibraryService.createFile).not.toHaveBeenCalled()
  })

  test("a token with only the media scope cannot attach a file", async () => {
    mocks.findWorkspaceByTokenHash.mockResolvedValue(authResult(["media"]))

    await expect(invoke(attachProcedure, attachInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'pipelines' scope",
    })
    expect(attachCalls()).toHaveLength(0)
  })
})
