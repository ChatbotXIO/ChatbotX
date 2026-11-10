// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  currentVersionId: "v2" as string | null,
  cancelFollowUps: vi.fn(),
  clearChallenges: vi.fn(),
  enqueueSync: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  lte: vi.fn(),
  db: {
    query: {
      flowModel: {
        findFirst: () =>
          Promise.resolve({ currentVersionId: mocks.currentVersionId }),
      },
    },
  },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: {},
  flowVersionModel: {},
}))
vi.mock("../src/pipeline/flow-publish-check", () => ({
  assertFlowPipelineStepsPublishable: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({ withCache: vi.fn() }))
vi.mock("../src/base.service", () => ({
  BaseService: class {
    invalidateCacheTags = vi.fn()
  },
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: {
    clearQuickReplyChallengesForStaleVersion: mocks.clearChallenges,
  },
}))
vi.mock("../src/smart-delay/service", () => ({
  smartDelayService: {
    cancelQuickReplyFollowUpsForStaleVersion: mocks.cancelFollowUps,
  },
}))
vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: { enqueueSyncOrThrow: mocks.enqueueSync },
}))
vi.mock("../src/decision/profile-service", () => ({
  decisionProfileService: {},
}))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable: vi.fn(),
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: vi.fn(),
}))
vi.mock("../src/template/uninstall-references", () => ({
  referencedParentsOf: vi.fn(),
}))
vi.mock("../src/flow-version/assert-publishable", () => ({
  assertFlowGraphPublishable: vi.fn(),
}))

const { flowVersionService } = await import("../src/flow-version/service")

const input = { workspaceId: "w1", flowId: "f1", versionId: "v2" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentVersionId = "v2"
  mocks.clearChallenges.mockResolvedValue(undefined)
  mocks.cancelFollowUps.mockResolvedValue(undefined)
})

describe("flowVersionService.afterPublishIfLive", () => {
  test("runs the effects while the version is live", async () => {
    await flowVersionService.afterPublishIfLive(input)

    expect(mocks.enqueueSync).toHaveBeenCalledTimes(1)
    expect(mocks.clearChallenges).toHaveBeenCalledWith(
      expect.objectContaining({ currentFlowVersionId: "v2" }),
    )
  })

  test("a superseded version cancels nothing of the newer one", async () => {
    mocks.currentVersionId = "v3"

    await flowVersionService.afterPublishIfLive(input)

    expect(mocks.clearChallenges).not.toHaveBeenCalled()
    expect(mocks.cancelFollowUps).not.toHaveBeenCalled()
  })
})
