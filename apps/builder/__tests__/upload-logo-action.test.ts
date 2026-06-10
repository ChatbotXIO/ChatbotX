// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const updateReturning: { current: unknown[] } = { current: [] }
const workspaceMembers: { current: { userId: string }[] } = { current: [] }
const workspace: { current: { logo: string | null } | undefined } = {
  current: { logo: null },
}

const updateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}

function wireUpdateBuilder() {
  updateBuilder.set.mockImplementation(() => updateBuilder)
  updateBuilder.where.mockImplementation(() => updateBuilder)
  updateBuilder.returning.mockImplementation(() =>
    Promise.resolve(updateReturning.current),
  )
}
wireUpdateBuilder()

const selectBuilder = {
  from: vi.fn(),
  where: vi.fn(),
}

function wireSelectBuilder() {
  selectBuilder.from.mockImplementation(() => selectBuilder)
  selectBuilder.where.mockImplementation(() =>
    Promise.resolve(workspaceMembers.current),
  )
}
wireSelectBuilder()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: vi.fn(() => updateBuilder),
    select: vi.fn(() => selectBuilder),
    query: {
      workspaceModel: {
        findFirst: vi.fn(() => Promise.resolve(workspace.current)),
      },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {
    id: "workspace.id",
    logo: "workspace.logo",
  },
  workspaceMemberModel: {
    userId: "workspaceMember.userId",
    workspaceId: "workspaceMember.workspaceId",
  },
}))

const uploadFileFromUrl = vi.fn()
vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  uploadFileFromUrl,
}))

const invalidateCacheByTags = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
}))

const createId = vi.fn(() => "logo-id")
vi.mock("@chatbotx.io/utils", () => ({
  createId,
}))

const { updateWorkspaceLogo } = await import(
  "../src/features/workspaces/actions/upload-logo"
)
const { db } = await import("@chatbotx.io/database/client")

function createIntegration(profilePictureUrl?: string) {
  return {
    runChannelHandler: vi.fn(async () => profilePictureUrl),
  }
}

function createFailingIntegration() {
  return {
    runChannelHandler: vi.fn(() =>
      Promise.reject(new Error("profile picture failed")),
    ),
  }
}

function createCtx() {
  return {
    storagePrefix: "public/space/ws-1",
    auth: { authType: "none" as const },
    platform: {
      appUrl: "https://app.example.com",
      wsUrl: "wss://realtime.example.com",
      storageUrl: "https://storage.example.com",
      getRealtimeAuthHeaders: vi.fn(async () => ({})),
    },
  }
}

function resetMocks() {
  vi.clearAllMocks()
  wireUpdateBuilder()
  wireSelectBuilder()
  vi.mocked(db.update).mockImplementation(
    () => updateBuilder as unknown as ReturnType<typeof db.update>,
  )
  vi.mocked(db.select).mockImplementation(
    () => selectBuilder as unknown as ReturnType<typeof db.select>,
  )
  createId.mockReturnValue("logo-id")
  uploadFileFromUrl.mockResolvedValue({
    originPath: "public/space/ws-1/logos/logo-id.jpg",
  })
  workspace.current = { logo: null }
  updateReturning.current = [{ id: "ws-1" }]
  workspaceMembers.current = [{ userId: "user-1" }, { userId: "user-2" }]
}

describe("updateWorkspaceLogo", () => {
  beforeEach(resetMocks)

  test("uploads integration profile picture and stores it when workspace logo is null", async () => {
    const integration = createIntegration("https://example.com/logo.jpg")
    const ctx = createCtx()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx,
    })

    expect(integration.runChannelHandler).toHaveBeenCalledWith(
      "bot",
      "getProfilePictureUrl",
      { ctx },
    )
    expect(uploadFileFromUrl).toHaveBeenCalledWith(
      "https://example.com/logo.jpg",
      "public/space/ws-1/logos/logo-id.jpg",
    )
    expect(updateBuilder.set).toHaveBeenCalledWith({
      logo: "public/space/ws-1/logos/logo-id.jpg",
    })
    expect(updateBuilder.where).toHaveBeenCalledWith({
      and: [{ eq: ["workspace.id", "ws-1"] }, { isNull: "workspace.logo" }],
    })
    expect(selectBuilder.where).toHaveBeenCalledWith({
      eq: ["workspaceMember.workspaceId", "ws-1"],
    })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-1",
      "users:user-1:workspace-members",
      "users:user-2:workspace-members",
    ])
  })

  test("does not update workspace when integration has no profile picture", async () => {
    const integration = createIntegration()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("does not update workspace when profile picture lookup fails", async () => {
    const integration = createFailingIntegration()

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("does not update workspace when profile picture upload fails", async () => {
    uploadFileFromUrl.mockRejectedValue(new Error("upload failed"))
    const integration = createIntegration("https://example.com/logo.jpg")

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(db.update).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("does not fetch or upload profile picture when workspace already has a logo", async () => {
    workspace.current = { logo: "public/space/ws-1/logos/existing.jpg" }
    const integration = createIntegration("https://example.com/logo.jpg")

    await updateWorkspaceLogo({
      id: "ws-1",
      integration,
      ctx: createCtx(),
    })

    expect(integration.runChannelHandler).not.toHaveBeenCalled()
    expect(uploadFileFromUrl).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
    expect(db.select).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
