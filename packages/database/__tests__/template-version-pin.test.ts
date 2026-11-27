// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// The pin runs inside the caller's transaction; the pool is never touched.
vi.mock("../src/client", async () => ({
  ...(await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm")),
  db: {},
}))

const { templateVersionRepository } = await import(
  "../src/repositories/template-version/repository"
)

/**
 * A transaction double that records every projection the pin selects and
 * answers each select, in order, with the given rows.
 */
const recordingTx = (answers: { version: number }[][]) => {
  const projections: string[][] = []
  const queue = [...answers]
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(queue.shift() ?? []),
  }
  const tx = {
    execute: vi.fn(() => Promise.resolve()),
    select: (projection: Record<string, unknown>) => {
      projections.push(Object.keys(projection))
      return chain
    },
  }
  return { tx: tx as never, projections, execute: tx.execute }
}

describe("templateVersionRepository.pinVersionNumber", () => {
  test("reads only the version column, never the payload", async () => {
    const { tx, projections } = recordingTx([[], [{ version: 7 }]])

    await templateVersionRepository.pinVersionNumber(
      { templateId: "55", requestedVersion: 4 },
      tx,
    )

    expect(projections).toEqual([["version"], ["version"]])
  })

  test("returns the requested version when it is stored, under the shared version lock", async () => {
    const { tx, projections, execute } = recordingTx([[{ version: 4 }]])

    expect(
      await templateVersionRepository.pinVersionNumber(
        { templateId: "55", requestedVersion: 4 },
        tx,
      ),
    ).toBe(4)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(projections).toHaveLength(1)
  })

  test("falls back to the newest stored version, then to the requested one", async () => {
    const pruned = recordingTx([[], [{ version: 9 }]])
    expect(
      await templateVersionRepository.pinVersionNumber(
        { templateId: "55", requestedVersion: 4 },
        pruned.tx,
      ),
    ).toBe(9)

    const none = recordingTx([[], []])
    expect(
      await templateVersionRepository.pinVersionNumber(
        { templateId: "55", requestedVersion: 4 },
        none.tx,
      ),
    ).toBe(4)
  })
})
