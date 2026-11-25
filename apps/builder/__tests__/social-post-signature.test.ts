// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const h = vi.hoisted(() => ({
  appendSignature: vi.fn(),
  assertNotBlocked: vi.fn(),
  create: vi.fn(),
  prepare: vi.fn(),
  publishNow: vi.fn(),
  schedule: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messageUsageService: { assertRoom: vi.fn() },
  assertSchedulePlan: vi.fn(),
  emitSocialPostChanged: vi.fn(),
  socialPostIssuesException: () => new Error("invalid"),
  publishDestinationService: {
    resolveRefs: vi.fn(
      ({ refs }: { refs: readonly { destinationId?: string }[] }) =>
        Promise.resolve(refs.map((ref) => ref.destinationId)),
    ),
  },
  socialPostPublishService: { publishNow: h.publishNow },
  socialPostRecurrenceService: { assertNotTemplate: vi.fn() },
  socialPostRemoveService: {},
  socialPostScheduleService: { prepare: h.prepare, schedule: h.schedule },
  socialPostService: {
    create: h.create,
    update: h.update,
    validate: vi.fn().mockResolvedValue({ issues: [] }),
  },
  socialPostSnippetService: { appendSignature: h.appendSignature },
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

describe("signature on create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.create.mockResolvedValue({ id: "1", status: "draft" })
    h.appendSignature.mockResolvedValue("Sale today\n\n— Acme")
  })

  test("appends the signature once to the stored text and does not store the id", async () => {
    await socialPostOperations.create(workspace, author, {
      ...base,
      signatureId: "7",
    } as never)

    expect(h.appendSignature).toHaveBeenCalledTimes(1)
    expect(h.appendSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureId: "7",
        text: "Sale today",
        workspaceId: "ws-1",
      }),
    )
    const stored = h.create.mock.calls[0]?.[0]
    expect(stored.text).toBe("Sale today\n\n— Acme")
    expect(stored).not.toHaveProperty("signatureId")
  })

  test("leaves the text alone without a signature", async () => {
    await socialPostOperations.create(workspace, author, base as never)

    expect(h.appendSignature).not.toHaveBeenCalled()
    expect(h.create.mock.calls[0]?.[0].text).toBe("Sale today")
  })

  test("an update never appends a signature", async () => {
    h.update.mockResolvedValue({ id: "1", status: "draft" })

    await socialPostOperations.update(workspace, {
      id: "1",
      text: "Edited",
    } as never)

    expect(h.appendSignature).not.toHaveBeenCalled()
  })
})

describe("idempotent create replay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.prepare.mockResolvedValue(vi.fn())
  })

  const create = (extra: object) =>
    socialPostOperations.create(workspace, author, {
      ...base,
      ...extra,
    } as never)

  test("the create input never carries the dispatch, so only content changes the hash", async () => {
    h.create.mockResolvedValue({ id: "1", status: "draft" })
    h.publishNow.mockResolvedValue({ id: "1", status: "publishing" })
    h.schedule.mockResolvedValue({ id: "1", status: "scheduled" })

    await create({ publish: "now" })
    await create({ scheduledAt: "2999-01-01T00:00:00.000Z" })
    await create({ scheduledAt: "2999-01-02T00:00:00.000Z" })

    for (const [input] of h.create.mock.calls) {
      expect(input).not.toHaveProperty("intent")
    }
  })

  test("a draft replayed with publish now publishes the same post", async () => {
    h.create.mockResolvedValue({ id: "1", status: "draft" })
    h.publishNow.mockResolvedValue({ id: "1", status: "publishing" })

    expect(await create({ publish: "now" })).toEqual({
      id: "1",
      status: "publishing",
    })
    expect(h.publishNow).toHaveBeenCalledWith({
      id: "1",
      workspaceId: "ws-1",
    })
  })

  test("a draft replayed with publish draft is left alone", async () => {
    h.create.mockResolvedValue({ id: "1", status: "draft" })

    await create({ publish: "draft" })

    expect(h.publishNow).not.toHaveBeenCalled()
    expect(h.schedule).not.toHaveBeenCalled()
  })

  test("a replayed post that is no longer a draft is returned as is", async () => {
    h.create.mockResolvedValue({ id: "1", status: "scheduled" })

    expect(await create({ publish: "now" })).toEqual({
      id: "1",
      status: "scheduled",
    })
    expect(h.publishNow).not.toHaveBeenCalled()
  })
})
