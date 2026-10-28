import { afterEach, describe, expect, test, vi } from "vitest"

const { findSourceMapMock } = vi.hoisted(() => ({
  findSourceMapMock: vi.fn(),
}))

vi.mock("node:module", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:module")>()),
  findSourceMap: findSourceMapMock,
}))

const { installSourceMappedStacks, sourceMapStack } = await import(
  "@chatbotx.io/logger/source-mapped-stack"
)

const CHUNK = "/app/.next/server/chunks/_1lca1wn._.js"

function fakeSourceMap(
  entries: Record<string, { source: string; line: number; column: number }>,
) {
  return {
    findEntry: (line: number, column: number) => {
      const entry = entries[`${line}:${column}`]
      return entry
        ? {
            originalSource: entry.source,
            originalLine: entry.line,
            originalColumn: entry.column,
          }
        : {}
    },
  }
}

describe("sourceMapStack", () => {
  const sourceMapsEnabled = process.sourceMapsEnabled

  afterEach(() => {
    findSourceMapMock.mockReset()
    Object.defineProperty(process, "sourceMapsEnabled", {
      value: sourceMapsEnabled,
      configurable: true,
    })
  })

  function enableSourceMaps(isEnabled: boolean) {
    Object.defineProperty(process, "sourceMapsEnabled", {
      value: isEnabled,
      configurable: true,
    })
  }

  test("returns the stack untouched when source maps are disabled", () => {
    enableSourceMaps(false)
    const stack = `Error: boom\n    at run (${CHUNK}:10:5)`

    expect(sourceMapStack(stack)).toBe(stack)
    expect(findSourceMapMock).not.toHaveBeenCalled()
  })

  test("maps first-party frames and keeps unmapped library frames", () => {
    enableSourceMaps(true)
    findSourceMapMock.mockReturnValue(
      fakeSourceMap({
        "2782:65377": {
          source: "file:///app/packages/worker-config/src/lib/connection.ts",
          line: 45,
          column: 19,
        },
      }),
    )
    const stack = [
      "Error: boom",
      `    at makeConnection (${CHUNK}:2783:65378)`,
      `    at ${CHUNK}:1513:161595`,
      "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
    ].join("\n")

    expect(sourceMapStack(stack)).toBe(
      [
        "Error: boom",
        "    at makeConnection (/app/packages/worker-config/src/lib/connection.ts:46:20)",
        `    at ${CHUNK}:1513:161595`,
        "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
      ].join("\n"),
    )
  })

  test("leaves frames without a loaded source map untouched", () => {
    enableSourceMaps(true)
    findSourceMapMock.mockReturnValue(undefined)
    const stack =
      "Error: boom\n    at run (/app/apps/worker/src/low/worker.ts:45:41)"

    expect(sourceMapStack(stack)).toBe(stack)
  })

  test("returns the original stack when a source map lookup throws", () => {
    enableSourceMaps(true)
    findSourceMapMock.mockImplementation(() => {
      throw new Error("invalid source map")
    })
    const stack = `Error: boom\n    at run (${CHUNK}:10:5)`

    expect(sourceMapStack(stack)).toBe(stack)
  })

  test("installs source mapping for err serialization", async () => {
    enableSourceMaps(true)
    findSourceMapMock.mockReturnValue(
      fakeSourceMap({
        "9:4": {
          source: "file:///app/apps/builder/src/instrumentation.ts",
          line: 12,
          column: 3,
        },
      }),
    )
    installSourceMappedStacks()
    const { redactErrSerializer } = await import("../src")
    const error = new Error("boom")
    error.stack = `Error: boom\n    at register (${CHUNK}:10:5)`
    const serialized = redactErrSerializer(error) as { stack: string }

    expect(serialized.stack).toBe(
      "Error: boom\n    at register (/app/apps/builder/src/instrumentation.ts:13:4)",
    )
  })
})
