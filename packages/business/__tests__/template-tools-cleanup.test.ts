// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
  assertResourceEditable: vi.fn(),
  deleteInTx: vi.fn(),
  pollDeleteInTx: vi.fn(),
  minigameDeleteInTx: vi.fn(),
  minigameRows: { current: [] as unknown[] },
  findFirst: vi.fn(),
  txUpdate: vi.fn(),
  txRows: { current: [] as unknown[] },
}))

const tx = {
  query: {
    dynamicImageModel: { findFirst: mocks.findFirst },
    pollModel: { findMany: () => Promise.resolve(mocks.txRows.current) },
    pollCandidateModel: { findMany: () => Promise.resolve([]) },
    minigameModel: {
      findMany: () => Promise.resolve(mocks.minigameRows.current),
    },
  },
  update: () => ({
    set: () => ({ where: () => Promise.resolve(undefined) }),
  }),
}

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    deleteObject: mocks.deleteObject,
    listObjects: mocks.listObjects,
    putObject: vi.fn(),
    getObject: vi.fn(),
  },
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable: mocks.assertResourceEditable,
  changedKeysOf: (
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) => Object.keys(patch).filter((key) => existing[key] !== patch[key]),
  withDeleteGuard: (_input: unknown, run: (tx: unknown) => unknown) => run(tx),
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: (run: (tx: unknown) => unknown) => run(tx),
}))
vi.mock("../src/dynamic-image/render", () => ({
  renderStaticLayer: vi.fn().mockResolvedValue(Buffer.from("png")),
  renderDynamicLayer: vi.fn(),
}))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    deleteByCustomFieldId: vi.fn(),
    findValue: vi.fn(),
  },
}))
vi.mock("../src/media", () => ({ resolveContactAvatarUrl: vi.fn() }))
vi.mock("../src/net/ssrf-guard", () => ({ isSsrfUnsafeUrl: vi.fn() }))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://storage.test/storage" }),
}))
vi.mock("@chatbotx.io/database/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/database/client")>()),
  db: {
    query: { dynamicImageModel: { findFirst: mocks.findFirst } },
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    update: tx.update,
  },
}))

vi.mock("../src/dynamic-image/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/dynamic-image/service")>()
  return {
    dynamicImageService: Object.assign(actual.dynamicImageService, {
      deleteInTx: (...args: unknown[]) => mocks.deleteInTx(...args),
    }),
  }
})
vi.mock("../src/minigame/service", () => ({
  minigameService: {
    deleteInTx: (...args: unknown[]) => mocks.minigameDeleteInTx(...args),
  },
}))
vi.mock("../src/poll/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/poll/service")>()
  return {
    ...actual,
    pollService: Object.assign(actual.pollService, {
      deleteInTx: (...args: unknown[]) => mocks.pollDeleteInTx(...args),
    }),
  }
})

const { dynamicImageService } = await import("../src/dynamic-image/service")

const STAGED =
  "public/space/ws-1/template-tool-images/tpl-1/g0/abc-background_5.png"
const row = {
  id: "d1",
  workspaceId: "ws-1",
  name: "Banner",
  customFieldId: null,
  data: { width: 10, height: 10, elements: [] },
  backgroundUrl: STAGED,
  enabled: true,
}
const input = {
  workspaceId: "ws-1",
  id: "d1",
  name: "Banner",
  customFieldId: null,
  data: row.data,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirst.mockResolvedValue(row)
  mocks.listObjects.mockResolvedValue({ Contents: [], IsTruncated: false })
})

describe("dynamic image service: template guards and staged backgrounds", () => {
  test("a View-only copy is refused before anything is rendered or uploaded", async () => {
    mocks.assertResourceEditable.mockRejectedValueOnce(new Error("locked"))

    await expect(
      dynamicImageService.update({ ...input, name: "Renamed" }),
    ).rejects.toThrow("locked")

    expect(mocks.assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "dynamicImage",
        changedKeys: ["name"],
      }),
    )
  })

  test("the cache field is the installer's: changing only it is not a content edit", async () => {
    await dynamicImageService
      .update({ ...input, customFieldId: "cf-1" })
      .catch(() => undefined)

    expect(mocks.assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({ changedKeys: [] }),
    )
  })

  test("the enabled toggle only refuses while an uninstall runs (no content keys)", async () => {
    await dynamicImageService
      .setEnabled({ workspaceId: "ws-1", id: "d1" }, false)
      .catch(() => undefined)

    expect(mocks.assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({ changedKeys: [] }),
    )
  })

  test("an update deletes the staged background the row no longer uses", async () => {
    await dynamicImageService.update(input).catch(() => undefined)

    expect(mocks.deleteObject).toHaveBeenCalledWith(STAGED)
  })

  test("a staged key of another workspace is never deleted", async () => {
    mocks.findFirst.mockResolvedValue({
      ...row,
      backgroundUrl: "public/space/ws-2/template-tool-images/tpl-1/g0/x.png",
    })

    await dynamicImageService.update(input).catch(() => undefined)

    expect(mocks.deleteObject).not.toHaveBeenCalledWith(
      expect.stringContaining("ws-2"),
    )
  })
})

describe("uninstall handlers of the tools", () => {
  const context = {
    workspaceId: "ws-1",
    installationId: "inst-1",
  } as never

  test("a dynamic image's staged background and element images are removed after the commit", async () => {
    const { UNINSTALL_HANDLER_BY_KIND } = await import(
      "../src/template/adapters/uninstall-handlers"
    )
    const staged = "public/space/ws-1/template-tool-images/tpl-inst-1/g0/el.png"
    mocks.deleteInTx.mockResolvedValue([
      {
        id: "d1",
        customFieldId: null,
        backgroundUrl: STAGED.replace("tpl-1", "tpl-inst-1"),
        data: {
          width: 1,
          height: 1,
          elements: [
            {
              id: "e",
              type: "image",
              imageType: "url",
              url: `https://cdn/${staged}`,
            },
            {
              id: "e2",
              type: "image",
              imageType: "url",
              url: "https://other.io/x.png",
            },
          ],
        },
      },
    ])

    const result =
      await UNINSTALL_HANDLER_BY_KIND.dynamicImage?.uninstallDelete(
        tx as never,
        ["d1"],
        context,
      )

    const names = result?.effects.get("d1")?.map((effect) => effect.name)
    expect(names).toEqual(["dynamicImage.cleanUp", "toolImage.deleteObjects"])
    const paths = result?.effects.get("d1")?.[1]?.args.paths ?? ""
    expect(paths).toContain(staged)
    expect(paths).not.toContain("other.io")
  })

  test("a poll's staged images (cover and candidates) are removed; an external image is left", async () => {
    const { UNINSTALL_HANDLER_BY_KIND } = await import(
      "../src/template/adapters/uninstall-handlers"
    )
    const cover = "public/space/ws-1/template-tool-images/tpl-inst-1/g0/cover"
    mocks.txRows.current = [
      { id: "p1", imageUrl: `https://cdn/${cover}` },
      { id: "p2", imageUrl: "https://external.io/c.png" },
    ]
    mocks.pollDeleteInTx.mockResolvedValue(["p1", "p2"])

    const result = await UNINSTALL_HANDLER_BY_KIND.poll?.uninstallDelete(
      tx as never,
      ["p1", "p2"],
      context,
    )

    expect(result?.effects.get("p1")?.[0]?.args.paths).toBe(cover)
    expect(result?.effects.has("p2")).toBe(false)
  })

  test("a minigame's staged images are removed, except the ones another minigame still shows", async () => {
    const { UNINSTALL_HANDLER_BY_KIND } = await import(
      "../src/template/adapters/uninstall-handlers"
    )
    const { minigameRepository } = await import(
      "@chatbotx.io/database/repositories"
    )
    const root = "public/space/ws-1/template-tool-images/tpl-inst-1/g0"
    const empty = { mode: "file", url: "" }
    const shown = (url: string) => ({
      backgroundImage: { mode: "file", url },
      prizeDescriptionImage: empty,
      startButtonImage: empty,
    })
    const prizes = {
      prizes: [],
      nonWinning: { title: "x", loseRate: 100, loseImage: empty },
    }
    mocks.minigameRows.current = [
      {
        id: "m1",
        appearance: shown(`https://cdn/${root}/own`),
        prizeSettings: {
          ...prizes,
          prizes: [
            {
              id: "p",
              icon: { mode: "file", url: `https://cdn/${root}/shared` },
            },
          ],
        },
      },
    ]
    // The database reports which of the minigame's images another one shows.
    const stillShown = vi
      .spyOn(minigameRepository, "findImageUrlsUsedByOthers")
      .mockResolvedValue(new Set([`https://cdn/${root}/shared`]))
    mocks.minigameDeleteInTx.mockResolvedValue(["m1"])

    const result = await UNINSTALL_HANDLER_BY_KIND.minigame?.uninstallDelete(
      tx as never,
      ["m1"],
      context,
    )

    expect(stillShown).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        excludeIds: ["m1"],
        urls: [`https://cdn/${root}/own`, `https://cdn/${root}/shared`],
      },
      tx,
    )
    expect(result?.effects.get("m1")?.[0]?.args.paths).toBe(`${root}/own`)
  })
})
