import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findRow: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  assertEditable: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
  renderStaticLayer: vi.fn(),
  isMarked: vi.fn(),
  clearMarker: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  db: { query: { dynamicImageModel: { findFirst: mocks.findRow } } },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  dynamicImageStaleBackgroundRepository: {
    isMarked: mocks.isMarked,
    clear: mocks.clearMarker,
  },
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    putObject: mocks.putObject,
    deleteObject: mocks.deleteObject,
    listObjects: mocks.listObjects,
  },
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => "id",
}))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: { findValue: vi.fn() },
}))
vi.mock("../src/net/ssrf-guard", () => ({ isSsrfUnsafeUrl: vi.fn() }))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://storage.test/storage" }),
}))
vi.mock("../src/dynamic-image/render", () => ({
  renderDynamicLayer: vi.fn(),
  renderStaticLayer: mocks.renderStaticLayer,
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable: mocks.assertEditable,
  changedKeysOf: vi.fn(),
  withDeleteGuard: vi.fn(),
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: async (
    callback: (tx: unknown) => Promise<unknown>,
  ) =>
    await callback({
      query: { dynamicImageModel: { findFirst: mocks.findRow } },
      update: () => ({
        set: (values: unknown) => {
          mocks.set(values)
          return { where: () => ({ returning: mocks.returning }) }
        },
      }),
    }),
}))

const { dynamicImageService } = await import("../src/dynamic-image/service")
const { ChatbotXException } = await import("../src/errors")

const STAGED =
  "public/space/ws-1/template-tool-images/tpl-1/900-background_1.png"
const OWN = /^public\/space\/ws-1\/dynamic-images\/img-1\/background_\d+\.png$/
const input = { workspaceId: "ws-1", id: "img-1", enabled: true }

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "img-1",
  workspaceId: "ws-1",
  enabled: false,
  backgroundUrl: STAGED,
  customFieldId: null,
  data: { width: 1, height: 1, elements: [] },
  ...overrides,
})

const deleted = () => mocks.deleteObject.mock.calls.map(([key]) => key)

describe("rerenderInstalledBackground compare-and-set", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.renderStaticLayer.mockResolvedValue(Buffer.from("png"))
    mocks.putObject.mockResolvedValue(undefined)
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.listObjects.mockResolvedValue({ Contents: [] })
    mocks.assertEditable.mockResolvedValue(undefined)
    mocks.findRow.mockResolvedValue(row())
  })

  test("applies when the row is unchanged and then removes the staged file", async () => {
    mocks.returning.mockResolvedValue([{ id: "img-1" }])
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(true)
    expect(mocks.set).toHaveBeenCalledWith({
      backgroundUrl: expect.stringMatching(OWN),
      enabled: true,
    })
    // Only the superseded file, never a sweep of the folder: a save that
    // committed after the compare-and-set keeps its newer background.
    expect(deleted()).toEqual([STAGED])
    expect(
      mocks.listObjects.mock.calls.filter(([prefix]) =>
        String(prefix).includes("/background"),
      ),
    ).toEqual([])
    expect(mocks.clearMarker).toHaveBeenCalledTimes(1)
  })

  test("two renders in the same millisecond never share a key", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mocks.returning.mockResolvedValue([])
    const keys = new Set<string>()
    for (let attempt = 0; attempt < 20; attempt++) {
      await dynamicImageService.rerenderInstalledBackground(input)
      keys.add(mocks.putObject.mock.calls.at(-1)?.[0])
    }
    vi.restoreAllMocks()
    expect(keys.size).toBeGreaterThan(1)
  })

  test("a colliding key is never deleted as the superseded background", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((
      array: Uint32Array,
    ) => {
      array[0] = 42
      return array
    }) as typeof crypto.getRandomValues)
    const colliding =
      "public/space/ws-1/dynamic-images/img-1/background_1700000000000000000042.png"
    mocks.findRow.mockResolvedValue(row({ backgroundUrl: colliding }))
    mocks.returning.mockResolvedValue([{ id: "img-1" }])
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(true)
    const written = mocks.putObject.mock.calls.at(-1)?.[0]
    vi.restoreAllMocks()
    expect(written).toBe(colliding)
    expect(deleted()).not.toContain(written)
  })

  test("nothing is overwritten when the row was edited or toggled meanwhile: only its own upload goes", async () => {
    mocks.returning.mockResolvedValue([])
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(false)
    const keys = deleted()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(OWN)
    expect(mocks.listObjects).not.toHaveBeenCalled()
    expect(mocks.clearMarker).not.toHaveBeenCalled()
  })

  test("a copy frozen by an uninstall is left alone", async () => {
    mocks.assertEditable.mockRejectedValue(
      new ChatbotXException("uninstalling", "templateUninstallInProgress", 409),
    )
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(false)
    expect(mocks.set).not.toHaveBeenCalled()
    expect(deleted()).toHaveLength(1)
    expect(deleted()[0]).toMatch(OWN)
  })

  test("a row deleted before the render starts renders and uploads nothing", async () => {
    mocks.findRow.mockResolvedValue(undefined)
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(false)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("a row the installer already switched on is not touched", async () => {
    mocks.findRow.mockResolvedValue(row({ enabled: true }))
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).resolves.toBe(false)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("an unexpected failure removes the new file and rethrows", async () => {
    mocks.returning.mockRejectedValue(new Error("db down"))
    await expect(
      dynamicImageService.rerenderInstalledBackground(input),
    ).rejects.toThrow("db down")
    expect(deleted()).toHaveLength(1)
    expect(deleted()[0]).toMatch(OWN)
  })
})

describe("setEnabled on a copy with a stale background", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.renderStaticLayer.mockResolvedValue(Buffer.from("png"))
    mocks.putObject.mockResolvedValue(undefined)
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.listObjects.mockResolvedValue({ Contents: [] })
    mocks.assertEditable.mockResolvedValue(undefined)
  })

  test("refuses to turn it on when the re-render fails", async () => {
    mocks.isMarked.mockResolvedValue(true)
    mocks.findRow.mockResolvedValue(row())
    mocks.renderStaticLayer.mockRejectedValue(new Error("canvas down"))
    await expect(
      dynamicImageService.setEnabled(
        { workspaceId: "ws-1", id: "img-1" },
        true,
      ),
    ).rejects.toMatchObject({ code: "dynamicImageBackgroundStale" })
    expect(mocks.set).not.toHaveBeenCalled()
  })

  test("a copy that is not marked stale is switched on without a render, even on its staged background", async () => {
    mocks.isMarked.mockResolvedValue(false)
    mocks.renderStaticLayer.mockRejectedValue(new Error("canvas down"))
    mocks.findRow.mockResolvedValue(row())
    await dynamicImageService.setEnabled(
      { workspaceId: "ws-1", id: "img-1" },
      true,
    )
    expect(mocks.renderStaticLayer).not.toHaveBeenCalled()
    expect(mocks.set).toHaveBeenCalledWith({ enabled: true })
  })
})

describe("update (editor save) never sweeps the folder", () => {
  const save = {
    workspaceId: "ws-1",
    id: "img-1",
    name: "Badge",
    data: { width: 1, height: 1, elements: [] },
  }
  const OLD = "public/space/ws-1/dynamic-images/img-1/background_1.png"

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.renderStaticLayer.mockResolvedValue(Buffer.from("png"))
    mocks.putObject.mockResolvedValue(undefined)
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.listObjects.mockResolvedValue({ Contents: [] })
    mocks.assertEditable.mockResolvedValue(undefined)
    mocks.findRow.mockResolvedValue(row({ enabled: true, backgroundUrl: OLD }))
  })

  const backgroundListings = () =>
    mocks.listObjects.mock.calls.filter(([prefix]) =>
      String(prefix).includes("/background"),
    )

  test("a saved copy deletes only the background it replaced", async () => {
    await dynamicImageService.update(save)
    expect(deleted()).toEqual([OLD])
    expect(backgroundListings()).toEqual([])
    expect(mocks.clearMarker).toHaveBeenCalledTimes(1)
  })

  test("a failed save deletes only its own upload, leaving a concurrent re-render's file", async () => {
    mocks.assertEditable
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("duplicate name"))
    await expect(dynamicImageService.update(save)).rejects.toThrow(
      "duplicate name",
    )
    const keys = deleted()
    const uploaded = mocks.putObject.mock.calls[0][0]
    expect(keys).toEqual([uploaded])
    expect(backgroundListings()).toEqual([])
  })
})
