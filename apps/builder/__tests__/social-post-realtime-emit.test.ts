// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertNotBlocked: vi.fn(),
  emit: vi.fn(),
  publishNow: vi.fn(),
  removeRequest: vi.fn(),
  reschedule: vi.fn(),
  schedule: vi.fn(),
  service: {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    validate: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  messageUsageService: { assertRoom: vi.fn() },
  assertSchedulePlan: vi.fn(),
  emitSocialPostChanged: mocks.emit,
  publishDestinationService: {
    resolveRefs: async (input: { refs: { destinationId?: string }[] }) =>
      input.refs.map((ref) => ref.destinationId ?? "dest"),
  },
  socialPostIssuesException: (issues: unknown[]) =>
    new Error(`invalid:${issues.length}`),
  socialPostPublishService: { publishNow: mocks.publishNow },
  socialPostRecurrenceService: {
    assertNotTemplate: vi.fn(),
    setRuleInTx: vi.fn(),
  },
  socialPostRemoveService: { request: mocks.removeRequest },
  socialPostScheduleService: {
    prepare: vi.fn(),
    prepareDraftTime: vi.fn(),
    reschedule: mocks.reschedule,
    schedule: mocks.schedule,
  },
  socialPostService: mocks.service,
  socialPostSnippetService: { appendSignature: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  validationException: (field: string, message: string) =>
    new Error(`${field}: ${message}`),
}))
vi.mock("@chatbotx.io/business/social-post/creator-settings", () => ({
  creatorSettingsIssues: vi.fn(async () => []),
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: mocks.assertNotBlocked,
}))

const { socialPostOperations } = await import(
  "@/features/social-posts/lib/social-post-operations"
)

const WORKSPACE = { id: "ws-1", ownerId: "owner-1" }
const AUTHOR = { createdById: "user-1", createdVia: "api" } as const
const WS = "ws-1"

/** `socialPostChanged` is announced after the write: create, update, reschedule, duplicate, delete. */
describe("socialPostChanged after composed-post writes (docs/posts.md, Realtime and notifications)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.service.validate.mockResolvedValue({ issues: [] })
  })

  test("create of a draft emits the stored status once, after the write", async () => {
    mocks.service.create.mockResolvedValue({ id: "p-1", status: "draft" })

    await socialPostOperations.create(WORKSPACE, AUTHOR, {
      targets: [{ destinationId: "d-1" }],
      text: "hello",
    } as never)

    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenCalledWith({
      socialPostId: "p-1",
      status: "draft",
      workspaceId: WS,
    })
    expect(mocks.service.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.emit.mock.invocationCallOrder[0],
    )
  })

  test("an idempotent repeat that finds the post already scheduled is announced as stored", async () => {
    mocks.service.create.mockResolvedValue({ id: "p-2", status: "scheduled" })

    await socialPostOperations.create(WORKSPACE, AUTHOR, {
      targets: [{ destinationId: "d-1" }],
      text: "hello",
    } as never)

    expect(mocks.emit).toHaveBeenCalledWith({
      socialPostId: "p-2",
      status: "scheduled",
      workspaceId: WS,
    })
  })

  test("a blocked workspace is refused before anything is stored or announced", async () => {
    mocks.assertNotBlocked.mockRejectedValue(new Error("trial expired"))

    await expect(
      socialPostOperations.create(WORKSPACE, AUTHOR, {
        targets: [{ destinationId: "d-1" }],
        text: "hello",
      } as never),
    ).rejects.toThrow("trial expired")

    expect(mocks.service.create).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  test("update emits the stored post's status", async () => {
    mocks.service.update.mockResolvedValue({ id: "p-3", status: "draft" })

    await socialPostOperations.update(WORKSPACE, {
      id: "p-3",
      text: "edited",
    } as never)

    expect(mocks.emit).toHaveBeenCalledWith({
      socialPostId: "p-3",
      status: "draft",
      workspaceId: WS,
    })
  })

  test("publish now leaves the announcement to the publish service (no double event here)", async () => {
    mocks.service.update.mockResolvedValue({ id: "p-3", status: "draft" })
    mocks.service.get.mockResolvedValue({ id: "p-3", targets: [] })
    mocks.publishNow.mockResolvedValue({ id: "p-3", status: "publishing" })

    await socialPostOperations.update(WORKSPACE, {
      id: "p-3",
      publish: "now",
      text: "edited",
    } as never)

    expect(mocks.publishNow).toHaveBeenCalledWith({
      id: "p-3",
      workspaceId: WS,
    })
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  test("reschedule and duplicate emit the resulting post", async () => {
    mocks.reschedule.mockResolvedValue({ id: "p-4", status: "scheduled" })
    mocks.service.duplicate.mockResolvedValue({ id: "p-5", status: "draft" })

    await socialPostOperations.reschedule(WORKSPACE, {
      id: "p-4",
      unschedule: true,
    } as never)
    await socialPostOperations.duplicate(WORKSPACE, AUTHOR, "p-4")

    expect(mocks.emit).toHaveBeenNthCalledWith(1, {
      socialPostId: "p-4",
      status: "scheduled",
      workspaceId: WS,
    })
    expect(mocks.emit).toHaveBeenNthCalledWith(2, {
      socialPostId: "p-5",
      status: "draft",
      workspaceId: WS,
    })
  })

  test("deleting a draft or cancelling a schedule emits status deleted", async () => {
    mocks.service.delete.mockResolvedValue(undefined)

    const result = await socialPostOperations.delete(WORKSPACE, { id: "p-6" })

    expect(result).toEqual({ deleted: true, removal: null })
    expect(mocks.emit).toHaveBeenCalledWith({
      socialPostId: "p-6",
      status: "deleted",
      workspaceId: WS,
    })
  })

  test("removal from the channels only requests it here: the remove service emits when the job ends", async () => {
    mocks.removeRequest.mockResolvedValue({ requested: 1 })

    await socialPostOperations.delete(WORKSPACE, {
      id: "p-7",
      removeFromChannels: true,
    })

    expect(mocks.removeRequest).toHaveBeenCalledWith({
      id: "p-7",
      workspaceId: WS,
    })
    expect(mocks.service.delete).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })
})
