// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertCopyNamed: vi.fn(),
  insertWithCandidates: vi.fn(),
  placeCreate: vi.fn(),
  dynamicInsert: vi.fn(),
  warn: vi.fn(),
  track: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: () => ({}),
  and: () => ({}),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  magicLinkModel: {},
  pollModel: {},
  dynamicImageModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  pollRepository: { insertWithCandidates: mocks.insertWithCandidates },
  placeLocationRepository: { create: mocks.placeCreate },
}))
vi.mock(import("@chatbotx.io/utils"), async (importOriginal) => ({
  ...(await importOriginal()),
  createId: () => "new-id",
}))
vi.mock("../src/poll/service", () => {
  const assertDateRange = (startsAt: Date, endsAt: Date) => {
    if (endsAt <= startsAt) {
      throw new Error("pollInvalidDateRange")
    }
  }
  const assertCandidateCount = (count: number) => {
    if (count < 2 || count > 10) {
      throw new Error("pollCandidateCount")
    }
  }
  return {
    // The service core: the shape rules, then the row write.
    pollService: {
      insertInTx: (
        tx: unknown,
        input: { startsAt: Date; endsAt: Date; candidates: unknown[] },
      ) => {
        assertDateRange(input.startsAt, input.endsAt)
        assertCandidateCount(input.candidates.length)
        return mocks.insertWithCandidates(input, tx)
      },
    },
  }
})
vi.mock("../src/dynamic-image/service", () => ({
  dynamicImageService: { insertInTx: mocks.dynamicInsert },
}))
vi.mock("../src/template/adapters/naming", () => ({
  insertCopyNamed: mocks.insertCopyNamed,
}))

const { magicLinksAdapter } = await import(
  "../src/template/adapters/magic-links"
)
const { pollsAdapter } = await import("../src/template/adapters/polls")
const { placeLocationsAdapter } = await import(
  "../src/template/adapters/place-locations"
)
const { dynamicImagesAdapter } = await import(
  "../src/template/adapters/dynamic-images"
)

const buildContext = (overrides: Record<string, unknown> = {}) => ({
  tx: {} as never,
  workspaceId: "ws-target",
  installationId: "inst-1",
  sourceWorkspaceId: "ws-source",
  idMaps: {} as Record<string, Map<string, string>>,
  track: mocks.track,
  warn: mocks.warn,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("magic links adapter", () => {
  test("every copy's name is bound, so a link to a renamed copy follows it", async () => {
    mocks.insertCopyNamed.mockImplementation(
      async (_ctx, input: { entry: { name: string } }) => ({
        id: `copy-of-${input.entry.name}`,
        name: input.entry.name === "taken" ? "taken-copy" : input.entry.name,
      }),
    )
    const ctx = buildContext()

    await magicLinksAdapter.insert(ctx, [
      { sourceId: "1", name: "free", url: "https://a.io" },
      { sourceId: "2", name: "taken", url: "https://b.io" },
    ])

    expect([...(ctx.magicLinkNameBindings ?? [])]).toEqual([
      ["free", "free"],
      ["taken", "taken-copy"],
    ])
    expect(mocks.insertCopyNamed).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        nameRules: { style: "slug", maxLength: 128 },
      }),
    )
  })

  test("the url follows a tool installed after the links, once every tool is in", async () => {
    mocks.insertCopyNamed.mockResolvedValue({ id: "link-new", name: "go" })
    const update = vi.fn()
    const where = vi.fn()
    const ctx = buildContext({
      idMaps: {},
      tx: {
        update: () => ({
          set: (values: unknown) => {
            update(values)
            return { where }
          },
        }),
      },
    })

    const [task] = await magicLinksAdapter.insert(ctx, [
      {
        sourceId: "1",
        name: "go",
        url: "https://x.io/dynamic-images?dynamicImageId=11",
      },
    ])
    expect(magicLinksAdapter.rewritesLinksInPatch).toBe(true)
    ctx.idMaps.dynamicImage = new Map([["11", "21"]])
    await task.apply(ctx)

    expect(update).toHaveBeenCalledWith({
      url: "https://x.io/dynamic-images?dynamicImageId=21",
    })
  })

  test("a name nobody can take is skipped without a binding", async () => {
    mocks.insertCopyNamed.mockResolvedValue(undefined)
    const ctx = buildContext()

    await magicLinksAdapter.insert(ctx, [
      { sourceId: "1", name: "gone", url: "https://a.io" },
    ])

    expect(ctx.magicLinkNameBindings).toBeUndefined()
    expect(mocks.track).not.toHaveBeenCalled()
  })
})

describe("polls adapter", () => {
  const poll = (overrides: Record<string, unknown> = {}) => ({
    sourceId: "p1",
    name: "Favourite",
    imageUrl: "https://cdn.example/other.png",
    startsAt: "2099-01-01T00:00:00.000Z",
    endsAt: "2099-02-01T00:00:00.000Z",
    afterVoteFlowId: null,
    candidates: [
      { name: "A", description: null, imageUrl: null },
      { name: "B", description: "second", imageUrl: null },
    ],
    ...overrides,
  })

  beforeEach(() => {
    mocks.insertWithCandidates.mockResolvedValue({ id: "poll-new" })
  })

  test("copies the candidates and no votes, mapping the poll id", async () => {
    const ctx = buildContext()

    await pollsAdapter.insert(ctx, [poll()])

    expect(mocks.insertWithCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-target",
        candidates: [
          { name: "A", description: null, imageUrl: null },
          { name: "B", description: "second", imageUrl: null },
        ],
      }),
      ctx.tx,
    )
    expect(ctx.idMaps.poll?.get("p1")).toBe("poll-new")
  })

  test("a poll whose end has passed installs with a scheduleExpired warning", async () => {
    await pollsAdapter.insert(buildContext(), [
      poll({
        startsAt: "2000-01-01T00:00:00.000Z",
        endsAt: "2000-02-01T00:00:00.000Z",
      }),
    ])

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "scheduleExpired" }),
    )
  })

  test("the same shape rules as the service apply (candidate count)", async () => {
    await expect(
      pollsAdapter.insert(buildContext(), [
        poll({
          candidates: [{ name: "only", description: null, imageUrl: null }],
        }),
      ]),
    ).rejects.toThrow("pollCandidateCount")
  })

  test("the after-vote flow and the candidates' links are patched in Phase 2", async () => {
    const tasks = await pollsAdapter.insert(buildContext(), [
      poll({ afterVoteFlowId: "flow-src" }),
    ])
    // One for the text links (tools installed later), one for the flow.
    expect(tasks).toHaveLength(2)
    expect(pollsAdapter.rewritesLinksInPatch).toBe(true)
  })
})

describe("place locations adapter", () => {
  test("the category resolves through the manifest; an unresolved one leaves the place uncategorised with a warning", async () => {
    mocks.placeCreate.mockResolvedValue({ id: "loc-new" })
    const ctx = buildContext({
      idMaps: { placeCategory: new Map([["cat-src", "cat-tgt"]]) },
    })

    await placeLocationsAdapter.insert(ctx, [
      {
        sourceId: "l1",
        name: " Shop ",
        latitude: 10,
        longitude: 20,
        categoryId: "cat-src",
      },
      {
        sourceId: "l2",
        name: "Other",
        latitude: 1,
        longitude: 2,
        categoryId: "cat-missing",
      },
    ])

    expect(mocks.placeCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Shop", categoryId: "cat-tgt" }),
      ctx.tx,
    )
    expect(mocks.placeCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ categoryId: null }),
      ctx.tx,
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "placeCategory" }),
    )
  })
})

describe("place locations adapter blank names", () => {
  test("a blank name is skipped with a warning instead of failing the install; a valid name is inserted", async () => {
    mocks.placeCreate.mockResolvedValue({ id: "loc-new" })
    const ctx = buildContext()

    await placeLocationsAdapter.insert(ctx, [
      {
        sourceId: "blank",
        name: "   ",
        latitude: 1,
        longitude: 2,
        categoryId: null,
      },
      {
        sourceId: "ok",
        name: "Shop",
        latitude: 3,
        longitude: 4,
        categoryId: null,
      },
    ])

    expect(mocks.placeCreate).toHaveBeenCalledTimes(1)
    expect(mocks.placeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Shop" }),
      ctx.tx,
    )
    expect(mocks.warn).toHaveBeenCalledWith({
      category: "placeLocations",
      entityKind: "placeLocationInvalid",
      path: "placeLocations.blank.name",
      value: "",
    })
    expect(mocks.track).toHaveBeenCalledTimes(1)
  })
})

describe("dynamic images adapter", () => {
  const image = (overrides: Record<string, unknown> = {}) => ({
    sourceId: "d1",
    name: "Banner",
    enabled: true,
    data: { width: 100, height: 100, elements: [] },
    backgroundUrl: "public/space/ws-source/dynamic-images/d1/background_5.png",
    customFieldId: "cf-src",
    ...overrides,
  })
  const stagedBackground = new Map([
    [
      "dynamicImages:d1:background",
      {
        targetPath:
          "public/space/ws-target/template-tool-images/tpl-inst-1/g0/abc-background_5.png",
      },
    ],
  ])

  beforeEach(() => {
    mocks.insertCopyNamed.mockImplementation(
      async (
        _ctx,
        input: { insert: (tx: unknown, name: string) => Promise<unknown> },
      ) => await input.insert({}, "Banner"),
    )
    mocks.dynamicInsert.mockResolvedValue({ id: "img-new" })
  })

  test("without its staged background the image is skipped with a warning", async () => {
    const ctx = buildContext({ staged: new Map() })

    await dynamicImagesAdapter.insert(ctx, [image()])

    expect(mocks.dynamicInsert).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "dynamicImage" }),
    )
  })

  test("a renamed copy stays within the 100 characters the editor accepts", async () => {
    await dynamicImagesAdapter.insert(
      buildContext({ staged: stagedBackground }),
      [image()],
    )
    expect(mocks.insertCopyNamed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nameRules: { style: "dash", maxLength: 100 },
      }),
    )
  })

  test("a cache field this install created is bound", async () => {
    const ctx = buildContext({
      staged: stagedBackground,
      idMaps: { customField: new Map([["cf-src", "cf-new"]]) },
    })

    await dynamicImagesAdapter.insert(ctx, [image()])

    expect(mocks.dynamicInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        customFieldId: "cf-new",
        backgroundUrl: expect.stringContaining("abc-background_5.png"),
      }),
    )
  })

  test("a cache field the installer already had is never claimed", async () => {
    const ctx = buildContext({
      staged: stagedBackground,
      idMaps: { customField: new Map([["cf-src", "cf-theirs"]]) },
      reusedCustomFieldIds: new Set(["cf-theirs"]),
    })

    await dynamicImagesAdapter.insert(ctx, [image()])

    expect(mocks.dynamicInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customFieldId: null }),
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "dynamicImageFieldNotBound" }),
    )
  })
})
