// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ copyObject: vi.fn() }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { copyObject: mocks.copyObject },
}))

const { stageToolImages } = await import("../src/template/adapters/staging")

const SOURCE_WORKSPACE = "100"
const imageUrl = (name: string) =>
  `https://cdn.example/public/space/${SOURCE_WORKSPACE}/media/${name}.png`

const slots = [
  { stageKey: "polls:1:imageUrl", url: imageUrl("cover") },
  { stageKey: "polls:1:candidate:0", url: imageUrl("a") },
  { stageKey: "polls:1:candidate:1", url: imageUrl("b") },
]

const stageContext = (
  tracked: string[],
  scope: { generation: number; attemptKey?: string } = { generation: 1 },
) => ({
  workspaceId: "200",
  installationId: "inst-1",
  scope,
  sourceWorkspaceId: SOURCE_WORKSPACE,
  trackCopiedObject: (path: string) => {
    tracked.push(path)
  },
})

describe("staging an install again after a failure", () => {
  const copyObject = mocks.copyObject

  beforeEach(() => {
    copyObject.mockReset().mockResolvedValue(undefined as never)
  })

  test("a re-run stages every image under the same keys, so nothing is duplicated", async () => {
    const firstTracked: string[] = []
    const secondTracked: string[] = []
    const first = await stageToolImages(
      stageContext(firstTracked),
      slots,
      "pollImage",
    )
    const second = await stageToolImages(
      stageContext(secondTracked),
      slots,
      "pollImage",
    )

    expect([...second.entries()]).toEqual([...first.entries()])
    expect(secondTracked.sort()).toEqual(firstTracked.sort())
    // Three distinct objects, written twice to the same three keys.
    expect(new Set(firstTracked).size).toBe(slots.length)
    const written = copyObject.mock.calls.map(([, target]) => target)
    expect(new Set(written).size).toBe(slots.length)
    expect(written).toHaveLength(slots.length * 2)
  })

  test("a copy that failed the first time is staged under the same key by the re-run", async () => {
    copyObject.mockRejectedValueOnce(new Error("storage timeout"))
    const first = await stageToolImages(stageContext([]), slots, "pollImage")
    expect(
      [...first.values()].filter((staged) => "skipped" in staged),
    ).toHaveLength(1)

    const retried = await stageToolImages(stageContext([]), slots, "pollImage")
    expect(
      [...retried.values()].filter((staged) => "skipped" in staged),
    ).toHaveLength(0)
    for (const [key, staged] of first.entries()) {
      if ("targetPath" in staged) {
        expect(retried.get(key)).toEqual(staged)
      }
    }
  })

  test("a sync attempt or a new generation stages under its own keys", async () => {
    const base = await stageToolImages(stageContext([]), slots, "pollImage")
    const nextGeneration = await stageToolImages(
      stageContext([], { generation: 2 }),
      slots,
      "pollImage",
    )
    const syncAttempt = await stageToolImages(
      stageContext([], { generation: 1, attemptKey: "sync-1" }),
      slots,
      "pollImage",
    )
    const pathsOf = (staged: typeof base) =>
      [...staged.values()].map((entry) =>
        "targetPath" in entry ? entry.targetPath : "",
      )
    const all = [
      ...pathsOf(base),
      ...pathsOf(nextGeneration),
      ...pathsOf(syncAttempt),
    ]
    expect(new Set(all).size).toBe(all.length)
  })
})
