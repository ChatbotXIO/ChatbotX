// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const getCurrent = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: getCurrent,
}))
vi.mock("@chatbotx.io/business/pipeline", () => ({
  pipelineService: { get },
}))
vi.mock("@/features/pipelines/lib/access", () => ({
  pipelineScopeFromMember: () => ({ kind: "support" }),
}))

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { canViewPipeline } from "@/features/pipelines/queries/can-view-pipeline.query"

const input = { workspaceId: "1", pipelineId: "2" }

describe("canViewPipeline", () => {
  beforeEach(() => {
    getCurrent.mockReset()
    get.mockReset()
    getCurrent.mockResolvedValue({
      targetWorkspaceMember: { id: "m", permissions: {}, role: "agent" },
      isSupportSession: false,
    })
  })

  test("is true when the service returns the pipeline", async () => {
    get.mockResolvedValue({})

    expect(await canViewPipeline(input)).toBe(true)
  })

  test("is false when the viewer is not a member", async () => {
    getCurrent.mockResolvedValue(null)

    expect(await canViewPipeline(input)).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })

  test("is false for a missing or forbidden pipeline (service notFound)", async () => {
    get.mockRejectedValue(
      new ChatbotXException("Pipeline not found", "notFound", 404),
    )

    expect(await canViewPipeline(input)).toBe(false)
  })

  test("rethrows unexpected failures", async () => {
    get.mockRejectedValue(new Error("db down"))

    await expect(canViewPipeline(input)).rejects.toThrow("db down")
  })
})
