// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  countReferences: vi.fn(),
  findFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteObject: vi.fn(),
  reindex: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))
vi.mock("@chatbotx.io/events", () => ({ removeTriggerCache: vi.fn() }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {
    findById: mocks.findFile,
    deleteById: mocks.deleteFile,
  },
  savedReplyImageRepository: { countReferences: mocks.countReferences },
}))
vi.mock("../src/pipeline/service", () => ({
  pipelineService: { notifyStructureChanged: mocks.notify },
}))
vi.mock("../src/ai-agent/service", () => ({ aiAgentService: {} }))
vi.mock("../src/ai-file/service", () => ({
  aiFileService: { reindex: mocks.reindex },
}))
vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: {},
}))
vi.mock("../src/coupon/service", () => ({ couponService: {} }))
vi.mock("../src/messenger-welcome-message-flow/service", () => ({
  messengerWelcomeMessageFlowService: {},
}))
vi.mock("../src/qr-code/qr-code.service", () => ({ qrCodeService: {} }))

await import("../src/template/uninstall-effect-runners")
const { runUninstallEffects } = await import(
  "../src/template/uninstall-effects"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countReferences.mockResolvedValue(0)
  mocks.findFile.mockResolvedValue({
    id: "m1",
    path: "public/space/w1/media-library/tpl-i1/x.png",
  })
})

describe("uninstall effect runners", () => {
  test("a handed-back AI file is reindexed through the existing reindex", async () => {
    const done = await runUninstallEffects([
      { name: "aiFile.reindex", args: { workspaceId: "w1", aiFileId: "f1" } },
    ])

    expect(done).toBe(true)
    expect(mocks.reindex).toHaveBeenCalledWith({
      workspaceId: "w1",
      id: "f1",
    })
  })

  test("a deleted pipeline tells the workspace its structure changed", async () => {
    const done = await runUninstallEffects([
      {
        name: "pipeline.afterStructureChange",
        args: { workspaceId: "w1", pipelineId: "8" },
      },
    ])

    expect(done).toBe(true)
    expect(mocks.notify).toHaveBeenCalledWith("w1", "8")
  })

  test("saved-reply images: an unreferenced media file loses its row and stored object", async () => {
    await runUninstallEffects([
      {
        name: "savedReply.deleteImages",
        args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
      },
    ])

    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "public/space/w1/media-library/tpl-i1/x.png",
    )
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      id: "m1",
      workspaceId: "w1",
    })
  })

  test("saved-reply images: the generation and legacy `tpl-<id>:` prefixes sync and old installs staged under are deleted too", async () => {
    for (const path of [
      "public/space/w1/media-library/tpl-i1/g0/x.png",
      "public/space/w1/media-library/tpl-i1/g2/sync-1:token/x.png",
      "public/space/w1/media-library/tpl-i1:sync-1:token/x.png",
      "public/space/w1/media-library/tpl-i1:claim/x.png",
    ]) {
      mocks.deleteObject.mockClear()
      mocks.findFile.mockResolvedValue({ id: "m1", path })
      await runUninstallEffects([
        {
          name: "savedReply.deleteImages",
          args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
        },
      ])
      expect(mocks.deleteObject).toHaveBeenCalledWith(path)
    }
  })

  test("saved-reply images: another installation whose id merely starts the same is never matched", async () => {
    mocks.deleteObject.mockClear()
    mocks.findFile.mockResolvedValue({
      id: "m1",
      path: "public/space/w1/media-library/tpl-i10/g0/x.png",
    })
    await runUninstallEffects([
      {
        name: "savedReply.deleteImages",
        args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
      },
    ])
    expect(mocks.deleteObject).not.toHaveBeenCalled()
  })

  test("saved-reply images: a file another saved reply still shows is kept", async () => {
    mocks.countReferences.mockResolvedValue(1)

    await runUninstallEffects([
      {
        name: "savedReply.deleteImages",
        args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
      },
    ])

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  test("saved-reply images: a file already gone is a no-op, so a rerun is safe", async () => {
    mocks.findFile.mockResolvedValue(undefined)

    await expect(
      runUninstallEffects([
        {
          name: "savedReply.deleteImages",
          args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
        },
      ]),
    ).resolves.toBe(true)
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  test("saved-reply images: a file the installation did not create is never deleted", async () => {
    // The installer's own upload, and a file another installation copied.
    for (const path of [
      "public/space/w1/media-library/mine.png",
      "public/space/w1/media-library/tpl-i2/theirs.png",
    ]) {
      mocks.findFile.mockResolvedValue({ id: "m1", path })
      await runUninstallEffects([
        {
          name: "savedReply.deleteImages",
          args: { workspaceId: "w1", installationId: "i1", fileIds: "m1" },
        },
      ])
    }

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  test("a failing runner leaves the effect recorded (returns false) for the sweep", async () => {
    mocks.notify.mockRejectedValue(new Error("redis down"))

    expect(
      await runUninstallEffects([
        {
          name: "pipeline.afterStructureChange",
          args: { workspaceId: "w1", pipelineId: "8" },
        },
      ]),
    ).toBe(false)
  })
})
