// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const h = vi.hoisted(() => ({
  assertNotBlocked: vi.fn(),
  assertRoom: vi.fn(),
  create: vi.fn(),
  hasIdempotencyKey: vi.fn(),
  publishNow: vi.fn(),
  resolveTarget: vi.fn(),
  retryTarget: vi.fn(),
  schedule: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertSchedulePlan: vi.fn(),
  emitSocialPostChanged: vi.fn(),
  messageUsageService: { assertRoom: h.assertRoom },
  publishDestinationService: {
    resolveRefs: vi.fn(
      ({ refs }: { refs: readonly { destinationId?: string }[] }) =>
        Promise.resolve(refs.map((ref) => ref.destinationId)),
    ),
  },
  socialPostIssuesException: () => new Error("invalid"),
  socialPostPublishService: {
    publishNow: h.publishNow,
    resolveTarget: h.resolveTarget,
    retryTarget: h.retryTarget,
  },
  socialPostRecurrenceService: { assertNotTemplate: vi.fn() },
  socialPostRemoveService: {},
  socialPostScheduleService: {
    prepare: vi.fn(),
    prepareDraftTime: vi.fn(),
    schedule: h.schedule,
  },
  socialPostService: {
    create: h.create,
    get: vi.fn().mockResolvedValue({ targets: [] }),
    hasIdempotencyKey: h.hasIdempotencyKey,
    update: h.update,
    validate: vi.fn().mockResolvedValue({ issues: [] }),
  },
  socialPostSnippetService: { appendSignature: vi.fn() },
}))
vi.mock("@chatbotx.io/business/social-post/creator-settings", () => ({
  creatorSettingsIssues: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: h.assertNotBlocked,
}))

const { socialPostOperations } = await import(
  "../src/features/social-posts/lib/social-post-operations"
)

const workspace = { id: "ws-1", ownerId: "owner-1" }
const author = { createdById: null, createdVia: "api" } as const
const base = { targets: [{ destinationId: "10" }], text: "Sale today" }
const QUOTA = new Error("postMessageQuotaExceeded")

describe("message quota preflight of publishing operations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.create.mockResolvedValue({ id: "1", status: "draft" })
    h.update.mockResolvedValue({ id: "1", status: "draft" })
    h.publishNow.mockResolvedValue({ id: "1", status: "publishing" })
    h.assertRoom.mockResolvedValue(undefined)
    h.hasIdempotencyKey.mockResolvedValue(false)
  })

  test("create with publish now answers the quota error before anything is created", async () => {
    h.assertRoom.mockRejectedValue(QUOTA)

    await expect(
      socialPostOperations.create(workspace, author, {
        ...base,
        publish: "now",
      } as never),
    ).rejects.toBe(QUOTA)

    expect(h.create).not.toHaveBeenCalled()
    expect(h.publishNow).not.toHaveBeenCalled()
  })

  test("a repeated idempotency key at the limit returns the stored post instead of a 429", async () => {
    h.assertRoom.mockRejectedValue(QUOTA)
    h.hasIdempotencyKey.mockResolvedValue(true)
    h.create.mockResolvedValue({ id: "1", status: "publishing" })

    const post = await socialPostOperations.create(workspace, author, {
      ...base,
      idempotencyKey: "key-1",
      publish: "now",
    } as never)

    expect(h.hasIdempotencyKey).toHaveBeenCalledWith("ws-1", "key-1")
    expect(h.assertRoom).not.toHaveBeenCalled()
    expect(post).toEqual({ id: "1", status: "publishing" })
  })

  test("a new idempotency key at the limit is still refused", async () => {
    h.assertRoom.mockRejectedValue(QUOTA)

    await expect(
      socialPostOperations.create(workspace, author, {
        ...base,
        idempotencyKey: "key-2",
        publish: "now",
      } as never),
    ).rejects.toBe(QUOTA)
    expect(h.create).not.toHaveBeenCalled()
  })

  test("the trial gate runs before the quota check", async () => {
    const blocked = new Error("workspaceBlocked")
    h.assertNotBlocked.mockRejectedValue(blocked)
    h.assertRoom.mockRejectedValue(QUOTA)

    await expect(socialPostOperations.publish(workspace, "1")).rejects.toBe(
      blocked,
    )
    expect(h.assertRoom).not.toHaveBeenCalled()
    h.assertNotBlocked.mockResolvedValue(undefined)
  })

  test("the publish-now operation and the update with publish now are refused at the limit", async () => {
    h.assertNotBlocked.mockResolvedValue(undefined)
    h.assertRoom.mockRejectedValue(QUOTA)

    await expect(socialPostOperations.publish(workspace, "1")).rejects.toBe(
      QUOTA,
    )
    await expect(
      socialPostOperations.update(workspace, {
        id: "1",
        publish: "now",
      } as never),
    ).rejects.toBe(QUOTA)

    expect(h.publishNow).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  test("retrying a target, or resolving it as retry, is refused at the limit", async () => {
    h.assertNotBlocked.mockResolvedValue(undefined)
    h.assertRoom.mockRejectedValue(QUOTA)

    await expect(
      socialPostOperations.retryTarget(workspace, {
        id: "1",
        targetId: "2",
      } as never),
    ).rejects.toBe(QUOTA)
    await expect(
      socialPostOperations.resolveTarget(workspace, {
        id: "1",
        outcome: "retry",
        targetId: "2",
      } as never),
    ).rejects.toBe(QUOTA)

    expect(h.retryTarget).not.toHaveBeenCalled()
    expect(h.resolveTarget).not.toHaveBeenCalled()
  })

  test("marking a target as published, drafts and updates without publish now are never gated", async () => {
    h.assertNotBlocked.mockResolvedValue(undefined)
    h.assertRoom.mockRejectedValue(QUOTA)
    h.resolveTarget.mockResolvedValue({ id: "1" })

    await socialPostOperations.resolveTarget(workspace, {
      id: "1",
      outcome: "published",
      targetId: "2",
    } as never)
    await socialPostOperations.create(workspace, author, base as never)
    await socialPostOperations.update(workspace, {
      id: "1",
      text: "Edited",
    } as never)

    expect(h.assertRoom).not.toHaveBeenCalled()
  })
})
