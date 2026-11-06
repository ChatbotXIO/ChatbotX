// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

// The real `resolveKeywordRuleMatch` (pure): the adapter must write exactly
// what the service would.
vi.mock("../src/automated-response/service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/automated-response/service")
  >()),
  automatedResponseService: { create: mockCreate },
}))

const { keywordsAdapter } = await import("../src/template/adapters/keywords")

const buildContext = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

describe("keywordsAdapter", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("resolves an inbound keyword into its inbound-scoped folder, not an outbound folder of the same name", async () => {
    mockCreate.mockResolvedValue({ id: "created-keyword-id" })

    const ctx = buildContext({
      folder: new Map([
        ["src-inbound-folder", "target-inbound-folder"],
        ["src-outbound-folder", "target-outbound-folder"],
      ]),
      flow: new Map([["src-flow", "target-flow"]]),
    })

    await keywordsAdapter.insert(ctx, [
      {
        sourceId: "src-keyword",
        type: "inbound",
        text: "Welcome!",
        keywords: ["hi", "hello"],
        flowId: "src-flow",
        folderId: "src-inbound-folder",
      },
    ])

    expect(mockCreate).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        type: "inbound",
        folderId: "target-inbound-folder",
        flowId: "target-flow",
      }),
      ctx.tx,
    )
  })

  test("warns and nulls the folder reference when the folder never resolved", async () => {
    mockCreate.mockResolvedValue({ id: "created-keyword-id" })
    const ctx = buildContext({})

    await keywordsAdapter.insert(ctx, [
      {
        sourceId: "src-keyword",
        type: "outbound",
        text: null,
        keywords: ["promo"],
        flowId: null,
        folderId: "src-missing-folder",
      },
    ])

    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "folder",
        value: "src-missing-folder",
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ folderId: null }),
      ctx.tx,
    )
  })

  describe("match conditions", () => {
    const conditions = [
      { operator: "contains" as const, values: ["price", "giá"] },
      { operator: "notContains" as const, values: ["test"] },
    ]

    test("installs a keyword with its conditions", async () => {
      mockCreate.mockResolvedValue({ id: "created" })
      const ctx = buildContext()

      await keywordsAdapter.insert(ctx, [
        {
          sourceId: "k1",
          type: "inbound",
          text: "Hi",
          keywords: ["price", "giá"],
          conditions,
          flowId: null,
          folderId: null,
        },
      ])

      const [, values] = mockCreate.mock.calls[0]
      expect(values).toMatchObject({ conditions })
      expect(values).not.toHaveProperty("keywords")
    })

    test("installs a keyword from a template made before conditions from its plain keywords", async () => {
      mockCreate.mockResolvedValue({ id: "created" })
      const ctx = buildContext()

      await keywordsAdapter.insert(ctx, [
        {
          sourceId: "k1",
          type: "inbound",
          text: "Hi",
          keywords: ["hello"],
          flowId: null,
          folderId: null,
        },
      ])

      const [, values] = mockCreate.mock.calls[0]
      expect(values).toMatchObject({ keywords: ["hello"] })
      expect(values).not.toHaveProperty("conditions")
    })

    test("a sync writes the conditions and mirrors their trigger words into keywords", async () => {
      const set = vi.fn(() => ({ where: vi.fn() }))
      const ctx = {
        ...buildContext(),
        tx: { update: vi.fn(() => ({ set })) } as never,
      }

      await keywordsAdapter.sync?.update(
        ctx as never,
        [
          {
            resourceId: "installed-1",
            entry: {
              sourceId: "k1",
              type: "inbound",
              text: "Hi",
              keywords: ["price", "giá"],
              conditions,
              flowId: null,
              folderId: null,
            },
          },
        ] as never,
      )

      expect(set).toHaveBeenCalledWith({
        text: "Hi",
        // `notContains` values exclude, so they are not trigger words.
        keywords: ["price", "giá"],
        conditions,
        flowId: null,
      })
    })

    describe("conditions that no longer validate", () => {
      const stale = [{ operator: "renamedOperator", values: ["price"] }]

      test("an empty or malformed conditions value also warns", async () => {
        mockCreate.mockResolvedValue({ id: "created" })
        for (const conditions of [[], "not-a-list"]) {
          const ctx = buildContext()
          await keywordsAdapter.insert(ctx, [
            {
              sourceId: "k1",
              type: "inbound",
              text: "Hi",
              keywords: ["price"],
              conditions: conditions as never,
              flowId: null,
              folderId: null,
            },
          ])
          expect(ctx.warn).toHaveBeenCalledWith(
            expect.objectContaining({ path: "keywords.k1.conditions" }),
          )
        }
      })

      test("install falls back to the plain keywords and warns", async () => {
        mockCreate.mockResolvedValue({ id: "created" })
        const ctx = buildContext()

        await keywordsAdapter.insert(ctx, [
          {
            sourceId: "k1",
            type: "inbound",
            text: "Hi",
            keywords: ["price"],
            conditions: stale as never,
            flowId: null,
            folderId: null,
          },
        ])

        const [, values] = mockCreate.mock.calls[0]
        expect(values).toMatchObject({ keywords: ["price"] })
        expect(values).not.toHaveProperty("conditions")
        expect(ctx.warn).toHaveBeenCalledWith(
          expect.objectContaining({ path: "keywords.k1.conditions" }),
        )
      })

      test("a sync does not fail: it writes the keywords as one contains condition and warns", async () => {
        const set = vi.fn(() => ({ where: vi.fn() }))
        const ctx = {
          ...buildContext(),
          tx: { update: vi.fn(() => ({ set })) } as never,
        }

        await keywordsAdapter.sync?.update(
          ctx as never,
          [
            {
              resourceId: "installed-1",
              entry: {
                sourceId: "k1",
                type: "inbound",
                text: "Hi",
                keywords: ["price"],
                conditions: stale,
                flowId: null,
                folderId: null,
              },
            },
          ] as never,
        )

        expect(set).toHaveBeenCalledWith(
          expect.objectContaining({
            keywords: ["price"],
            conditions: [{ operator: "contains", values: ["price"] }],
          }),
        )
        expect(ctx.warn).toHaveBeenCalled()
      })
    })
  })
})
