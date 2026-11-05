// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listObjects: vi.fn(),
  deleteObject: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    listObjects: mocks.listObjects,
    deleteObject: mocks.deleteObject,
  },
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { deleteLosingSyncAttempts } = await import(
  "../src/template/template-staged-cleanup"
)

const input = {
  workspaceId: "1",
  installationId: "2",
  generation: 3,
  syncId: "4",
  winningAttemptKey: "4:won",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listObjects.mockResolvedValue({ Contents: [] })
  mocks.deleteObject.mockResolvedValue(undefined)
})

describe("deleteLosingSyncAttempts", () => {
  test("lists only that sync's attempts, in every namespace", async () => {
    await deleteLosingSyncAttempts(input)

    expect(mocks.listObjects.mock.calls.map(([prefix]) => prefix)).toEqual([
      "workspaces/1/ai-files/tpl-2/g3/4:",
      "public/space/1/questionnaire-images/tpl-2/g3/4:",
      "public/space/1/media-library/tpl-2/g3/4:",
    ])
  })

  test("deletes what the other attempts left, never the committed one's", async () => {
    const lost = "workspaces/1/ai-files/tpl-2/g3/4:old/file"
    const won = "workspaces/1/ai-files/tpl-2/g3/4:won/file"
    mocks.listObjects.mockResolvedValueOnce({
      Contents: [{ Key: lost }, { Key: won }],
    })

    await deleteLosingSyncAttempts(input)

    expect(mocks.deleteObject.mock.calls).toEqual([[lost]])
  })

  test("storage being down never fails the sync", async () => {
    mocks.listObjects.mockRejectedValue(new Error("down"))

    await expect(deleteLosingSyncAttempts(input)).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalled()
  })
})
