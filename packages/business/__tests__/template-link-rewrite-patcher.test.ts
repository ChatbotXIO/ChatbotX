// @vitest-environment node

import { describe, expect, test, vi } from "vitest"
import { createLinkRewritePatcher } from "../src/template/adapters/link-rewrite-patcher"
import type { TemplateInstallContext } from "../src/template/adapters/types"

const context = (idMaps: Record<string, Map<string, string>>) =>
  ({
    tx: { name: "tx" },
    workspaceId: "ws-target",
    sourceWorkspaceId: "ws-source",
    idMaps,
    warn: vi.fn(),
  }) as unknown as TemplateInstallContext

describe("createLinkRewritePatcher", () => {
  test("has no task when nothing was deferred", () => {
    expect(createLinkRewritePatcher("miniApps").tasks()).toEqual([])
  })

  test("rewrites from the original value to the copies, ids resolved when the patch runs", async () => {
    const patcher = createLinkRewritePatcher<{ url: string; note: string }>(
      "miniApps",
    )
    const write = vi.fn(async () => undefined)
    patcher.defer({
      sourceId: "1",
      original: {
        url: "https://x.io/minigames?minigameId=5&token={{t}}",
        note: "https://x.io/mini-apps?id=1",
      },
      write,
    })
    const [task] = patcher.tasks()
    // The maps are filled after the adapter's insert, as later categories install.
    const ctx = context({
      minigame: new Map([["5", "50"]]),
      miniApp: new Map([["1", "10"]]),
    })
    await task.apply(ctx)

    expect(write).toHaveBeenCalledWith(
      ctx.tx,
      {
        url: "https://x.io/minigames?minigameId=50&token={{t}}",
        note: "https://x.io/mini-apps?id=10",
      },
      ctx,
    )
    // Re-running starts from the original again: same result.
    await task.apply(ctx)
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1]?.[1]).toEqual(write.mock.calls[0]?.[1])
  })

  test("writes nothing when no link changed; an unknown link stays and warns", async () => {
    const patcher = createLinkRewritePatcher<string>("leaderboards")
    const write = vi.fn(async () => undefined)
    patcher.defer({
      sourceId: "9",
      original: "see https://x.io/minigames?minigameId=404 and plain text",
      write,
    })
    const ctx = context({})
    await patcher.tasks()[0]?.apply(ctx)

    expect(write).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "linkNotRemapped" }),
    )
  })

  test("finish runs on the rewritten value and its change is written", async () => {
    const patcher = createLinkRewritePatcher<string>("dynamicImages")
    const write = vi.fn(async () => undefined)
    patcher.defer({
      sourceId: "2",
      original: "plain",
      finish: (value) => `${value}!`,
      write,
    })
    await patcher.tasks()[0]?.apply(context({}))
    expect(write).toHaveBeenCalledWith(
      expect.anything(),
      "plain!",
      expect.anything(),
    )
  })
})
