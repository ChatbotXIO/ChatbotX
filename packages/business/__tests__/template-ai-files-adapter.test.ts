// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  copyObject: vi.fn(),
  assertProvider: vi.fn(),
  createFromCopiedObject: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { aiFileModel: { findMany: mocks.findMany } } },
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { copyObject: mocks.copyObject },
}))
vi.mock("../src/ai-file/service", () => ({
  aiFileService: {
    assertEmbeddingProviderConfigured: mocks.assertProvider,
    createFromCopiedObject: mocks.createFromCopiedObject,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { aiFilesAdapter, TEMPLATE_AI_FILES_MAX_BYTES } = await import(
  "../src/template/adapters/ai-files"
)
const { ChatbotXException } = await import("../src/errors")

const TARGET_PATH = /^workspaces\/ws-2\/ai-files\/tpl-inst-1\/g0\/[0-9a-f]{64}$/

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-1",
  name: "Price list.pdf",
  path: "workspaces/11/ai-files/abc",
  mimeType: "application/pdf",
  size: 1000,
  chunkingConfig: null,
  ...overrides,
})

const install = async (entries: Record<string, unknown>[]) => {
  const warnings: { entityKind: string }[] = []
  const copied: string[] = []
  const tracked: Record<string, unknown>[] = []
  const ctx = {
    tx: {},
    workspaceId: "ws-2",
    sourceWorkspaceId: "11",
    installationId: "inst-1",
    idMaps: {} as Record<string, Map<string, string>>,
    track: (e: Record<string, unknown>) => tracked.push(e),
    warn: (w: { entityKind: string }) => warnings.push(w),
    trackCopiedObject: (path: string) => copied.push(path),
  }
  const staged = await aiFilesAdapter.stage?.(
    {
      workspaceId: ctx.workspaceId,
      sourceWorkspaceId: ctx.sourceWorkspaceId,
      installationId: ctx.installationId,
      scope: { generation: 0 },
      trackCopiedObject: ctx.trackCopiedObject,
    },
    entries as never,
  )
  await aiFilesAdapter.insert({ ...ctx, staged } as never, entries as never)
  return { ctx, warnings, copied, tracked }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertProvider.mockResolvedValue(undefined)
  mocks.copyObject.mockResolvedValue(undefined)
  mocks.createFromCopiedObject.mockImplementation(
    async (input: { path: string }) => ({ id: "new-file", path: input.path }),
  )
})

describe("ai files adapter: install", () => {
  test("copies the bytes to a key derived from the install and records the queued row", async () => {
    const { ctx, copied, tracked } = await install([entry()])

    expect(mocks.copyObject).toHaveBeenCalledWith(
      "workspaces/11/ai-files/abc",
      expect.stringMatching(TARGET_PATH),
    )
    expect(copied).toHaveLength(1)
    expect(mocks.createFromCopiedObject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-2",
        name: "Price list.pdf",
        path: copied[0],
      }),
    )
    expect(ctx.idMaps.aiFile.get("src-1")).toBe("new-file")
    expect(tracked).toEqual([
      expect.objectContaining({
        resourceKind: "aiFile",
        sourceResourceId: "src-1",
        wasExisting: false,
      }),
    ])
  })

  test("a retried install writes to the same key", async () => {
    await install([entry()])
    await install([entry()])

    const [first, second] = mocks.copyObject.mock.calls.map(([, to]) => to)
    expect(first).toBe(second)
  })

  test("without an embedding provider nothing is copied and each file is reported once", async () => {
    mocks.assertProvider.mockRejectedValue(
      new ChatbotXException("none", "noEmbeddingProvider", 400),
    )

    const { warnings } = await install([entry(), entry({ sourceId: "src-2" })])

    expect(mocks.assertProvider).toHaveBeenCalledTimes(1)
    expect(mocks.copyObject).not.toHaveBeenCalled()
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "noEmbeddingProvider" }),
      expect.objectContaining({ entityKind: "noEmbeddingProvider" }),
    ])
  })

  test("insert never touches storage: an unstaged file is reported, not copied", async () => {
    const warnings: { entityKind: string }[] = []
    await aiFilesAdapter.insert(
      {
        tx: {},
        workspaceId: "ws-2",
        idMaps: {},
        track: vi.fn(),
        warn: (w: { entityKind: string }) => warnings.push(w),
      } as never,
      [entry()] as never,
    )

    expect(mocks.copyObject).not.toHaveBeenCalled()
    expect(mocks.createFromCopiedObject).not.toHaveBeenCalled()
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "aiFileUnavailable" }),
    ])
  })

  test("any other provider-check failure aborts the install", async () => {
    mocks.assertProvider.mockRejectedValue(new Error("db down"))

    await expect(install([entry()])).rejects.toThrow("db down")
  })

  test("a path outside the AI file prefix is never copied", async () => {
    const { warnings } = await install([
      entry({ path: "workspaces/11/secrets/key" }),
      entry({ sourceId: "src-2", path: "../../etc/passwd" }),
    ])

    expect(mocks.copyObject).not.toHaveBeenCalled()
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatchObject({ entityKind: "aiFileUnavailable" })
  })

  test("an object of a workspace other than the publisher's is never copied", async () => {
    const { warnings } = await install([
      entry({ path: "workspaces/99/ai-files/abc" }),
    ])

    expect(mocks.copyObject).not.toHaveBeenCalled()
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "aiFileUnavailable" }),
    ])
  })

  test("files past the total size cap are skipped, not the whole install", async () => {
    const big = Math.floor(TEMPLATE_AI_FILES_MAX_BYTES * 0.6)
    const { warnings, ctx } = await install([
      entry({ sourceId: "a", size: big }),
      entry({ sourceId: "b", size: big, path: "workspaces/11/ai-files/b" }),
    ])

    expect(mocks.copyObject).toHaveBeenCalledTimes(1)
    expect(ctx.idMaps.aiFile.has("a")).toBe(true)
    expect(ctx.idMaps.aiFile.has("b")).toBe(false)
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "aiFileTooLarge" }),
    ])
  })

  test("a file whose object cannot be copied is skipped with a warning", async () => {
    mocks.copyObject.mockRejectedValueOnce(new Error("NoSuchKey"))

    const { warnings, copied } = await install([
      entry(),
      entry({ sourceId: "src-2", path: "workspaces/11/ai-files/ok" }),
    ])

    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "aiFileUnavailable" }),
    ])
    expect(copied).toHaveLength(1)
  })

  test("an empty list does nothing, not even a provider check", async () => {
    await install([])

    expect(mocks.assertProvider).not.toHaveBeenCalled()
  })
})

describe("ai files adapter: collect", () => {
  test("ships the stored object path and chunking parameters", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "f1",
        name: "A",
        path: "workspaces/11/ai-files/abc",
        mimeType: "text/plain",
        size: 5,
        chunkingConfig: { strategy: "fixed" },
      },
    ])

    const result = await aiFilesAdapter.collector.collect("11", ["f1"])

    expect(result.entries).toEqual([
      {
        sourceId: "f1",
        name: "A",
        path: "workspaces/11/ai-files/abc",
        mimeType: "text/plain",
        size: 5,
        chunkingConfig: { strategy: "fixed" },
      },
    ])
  })
})
