// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  fail: vi.fn(),
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
  listWithStagedObjectsToClean: vi.fn(),
  advanceStagedCleanedGeneration: vi.fn(),
  releaseStagedObjectsCleanup: vi.fn(),
  findPendingPublishEffects: vi.fn(),
  clearPendingPublishEffects: vi.fn(),
  deferPendingPublishEffects: vi.fn(),
  claimStagedObjectsCleanup: vi.fn(),
  settingsInsert: vi.fn(),
  settingsStage: vi.fn(),
  afterPublish: vi.fn(),
  warn: vi.fn(),
  findByIdAndWorkspace: vi.fn(),
}))

vi.mock("../src/template/sync-hash", () => ({
  stampSyncedHashes: vi.fn(),
}))
vi.mock("../src/coupon/service", () => ({
  couponService: { invalidate: vi.fn() },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ execute: vi.fn() }),
  },
  sql: { raw: (text: string) => text },
}))

vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    claim: mocks.claim,
    complete: mocks.complete,
    release: mocks.release,
    fail: mocks.fail,
    listWithStagedObjectsToClean: mocks.listWithStagedObjectsToClean,
    advanceStagedCleanedGeneration: mocks.advanceStagedCleanedGeneration,
    releaseStagedObjectsCleanup: mocks.releaseStagedObjectsCleanup,
    findPendingPublishEffects: mocks.findPendingPublishEffects,
    clearPendingPublishEffects: mocks.clearPendingPublishEffects,
    deferPendingPublishEffects: mocks.deferPendingPublishEffects,
    claimStagedObjectsCleanup: mocks.claimStagedObjectsCleanup,
    findByIdAndWorkspace: mocks.findByIdAndWorkspace,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstalledResourceModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({ updateTriggerCache: vi.fn() }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    deleteObject: mocks.deleteObject,
    listObjects: mocks.listObjects,
  },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, error: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/ai-agent/service", () => ({
  aiAgentService: { invalidate: vi.fn() },
}))
vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: { invalidateCache: vi.fn() },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { invalidate: vi.fn() },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { invalidate: vi.fn() },
}))
vi.mock("../src/flow-version", () => ({
  flowVersionService: { afterPublishOrThrow: mocks.afterPublish },
}))
vi.mock("../src/template/adapters/manifests/resolve", () => ({
  resolveManifests: vi.fn().mockResolvedValue({
    installFolderId: null,
    denied: new Set(),
  }),
}))
vi.mock("../src/pipeline/service", () => ({
  pipelineService: { invalidateList: vi.fn() },
}))
vi.mock("../src/template/adapters/registry", () => ({
  TEMPLATE_INSTALL_ORDER: ["settings"],
  getTemplateAdapter: (category: string) =>
    category === "settings"
      ? { insert: mocks.settingsInsert, stage: mocks.settingsStage }
      : undefined,
}))

const { templateInstallService } = await import(
  "../src/template/install.service"
)

const payload = {
  source: { workspaceId: "11", tenantId: "1" },
  manifests: {
    folders: [],
    customFields: [],
    tags: [],
    productCategories: [],
  },
  resources: {
    settings: {
      savedReplies: [{ sourceId: "reply-1", kind: "savedReply" }],
      botFields: [],
    },
  },
}

const install = () =>
  templateInstallService.run({
    installationId: "install-1",
    workspaceId: "ws-1",
    claimToken: "token-1",
    payload: payload as never,
    templateName: "Shop",
    createInstallFolder: false,
  })

describe("templateInstallService.run copied storage objects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.findPendingPublishEffects.mockResolvedValue([])
    mocks.settingsStage.mockResolvedValue(new Map())
    mocks.complete.mockResolvedValue(true)
    mocks.findByIdAndWorkspace.mockResolvedValue({
      claimToken: "token-1",
      status: "installing",
    })
  })

  test("a flow installed live records its after-publish effects with the completion, then runs and clears them after commit", async () => {
    mocks.settingsInsert.mockImplementation((ctx) => {
      ctx.publishedFlows.push({ flowId: "f1", versionId: "v1" })
      return []
    })
    // What the repository would hold once the completion committed.
    mocks.complete.mockImplementation((input) => {
      mocks.findPendingPublishEffects.mockResolvedValue(
        input.completion.pendingPublishEffects ?? [],
      )
      return Promise.resolve(true)
    })

    await install()

    expect(mocks.complete.mock.calls[0][0].completion).toMatchObject({
      pendingPublishEffects: [{ flowId: "f1", versionId: "v1" }],
    })
    expect(mocks.afterPublish).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "f1",
      versionId: "v1",
    })
    expect(mocks.clearPendingPublishEffects).toHaveBeenCalledWith({
      id: "install-1",
      done: [{ flowId: "f1", versionId: "v1" }],
    })
  })

  test("an effect that failed stays owed for the sweep; the ones that ran are cleared", async () => {
    mocks.afterPublish
      .mockRejectedValueOnce(new Error("queue down"))
      .mockResolvedValueOnce(undefined)
    mocks.findPendingPublishEffects.mockResolvedValue([
      { flowId: "f1", versionId: "v1" },
      { flowId: "f2", versionId: "v2" },
    ])

    await expect(
      templateInstallService.flushPublishEffects({
        installationId: "install-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.clearPendingPublishEffects).toHaveBeenCalledWith({
      id: "install-1",
      done: [{ flowId: "f2", versionId: "v2" }],
    })
    expect(mocks.deferPendingPublishEffects).toHaveBeenCalledWith("install-1")
  })

  test("a flush where everything ran is not deferred", async () => {
    mocks.afterPublish.mockResolvedValue(undefined)
    mocks.findPendingPublishEffects.mockResolvedValue([
      { flowId: "f1", versionId: "v1" },
    ])

    await templateInstallService.flushPublishEffects({
      installationId: "install-1",
      workspaceId: "ws-1",
    })

    expect(mocks.deferPendingPublishEffects).not.toHaveBeenCalled()
    mocks.afterPublish.mockReset()
  })

  test("nothing is cleared when every effect failed, and the row rotates behind the others", async () => {
    mocks.afterPublish.mockRejectedValue(new Error("queue down"))
    mocks.findPendingPublishEffects.mockResolvedValue([
      { flowId: "f1", versionId: "v1" },
    ])

    await templateInstallService.flushPublishEffects({
      installationId: "install-1",
      workspaceId: "ws-1",
    })

    expect(mocks.clearPendingPublishEffects).not.toHaveBeenCalled()
    expect(mocks.deferPendingPublishEffects).toHaveBeenCalledWith("install-1")
    mocks.afterPublish.mockReset()
  })

  test("no after-publish effect runs when the install rolled back", async () => {
    mocks.settingsInsert.mockImplementation((ctx) => {
      ctx.publishedFlows.push({ flowId: "f1", versionId: "v1" })
      throw new Error("adapter failed")
    })

    await expect(install()).rejects.toThrow("adapter failed")

    expect(mocks.afterPublish).not.toHaveBeenCalled()
  })

  test("stages under the installation's generation, not a shared key", async () => {
    mocks.settingsStage.mockResolvedValue(new Map())
    mocks.settingsInsert.mockResolvedValue([])
    await templateInstallService.run({
      installationId: "install-1",
      workspaceId: "ws-1",
      claimToken: "token-1",
      payload: payload as never,
      templateName: "Shop",
      createInstallFolder: false,
      stagingGeneration: 4,
    })
    expect(mocks.settingsStage.mock.calls[0][0].scope).toEqual({
      generation: 4,
    })
  })

  test("keys the staged objects by installation only, so a retry overwrites the same keys", async () => {
    // An earlier test's failing insert would otherwise still be in place.
    mocks.settingsInsert.mockResolvedValue([])
    await install()

    expect(mocks.settingsStage.mock.calls[0][0].installationId).toBe(
      "install-1",
    )
  })

  test("a failed attempt deletes nothing: the retry (or a stale worker's winner) reuses the keys", async () => {
    mocks.settingsStage.mockImplementation((ctx) => {
      ctx.trackCopiedObject("workspaces/ws-1/ai-files/a")
      return new Map()
    })
    mocks.settingsInsert.mockImplementation(() => {
      throw new Error("adapter failed")
    })

    await expect(install()).rejects.toThrow("adapter failed")

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.listObjects).not.toHaveBeenCalled()
  })

  test("stages storage objects before the apply transaction opens", async () => {
    const order: string[] = []
    mocks.settingsStage.mockImplementation(() => {
      order.push("stage")
      return Promise.resolve(new Map())
    })
    mocks.settingsInsert.mockImplementation(() => {
      order.push("insert")
      return []
    })

    await install()

    expect(order).toEqual(["stage", "insert"])
  })
})

describe("templateInstallService lease handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.findPendingPublishEffects.mockResolvedValue([])
    mocks.settingsStage.mockResolvedValue(new Map())
    mocks.settingsInsert.mockResolvedValue([])
  })

  test("claim returns null for a redelivery or a lease held by another worker", async () => {
    mocks.claim.mockResolvedValue(null)

    await expect(
      templateInstallService.claim({
        installationId: "install-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
  })

  test("claim hands the winner its token and a lease cutoff", async () => {
    mocks.claim.mockResolvedValue({ id: "install-1" })

    const claim = await templateInstallService.claim({
      installationId: "install-1",
      workspaceId: "ws-1",
    })

    expect(claim?.claimToken).toEqual(expect.any(String))
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "install-1",
        workspaceId: "ws-1",
        claimToken: claim?.claimToken,
        leaseExpiredBefore: expect.any(Date),
      }),
    )
  })

  test("commits completion fenced by the claim token", async () => {
    mocks.complete.mockResolvedValue(true)

    await install()

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "install-1", claimToken: "token-1" }),
      expect.anything(),
    )
  })

  test("rolls the whole install back when the lease was lost", async () => {
    mocks.complete.mockResolvedValue(false)

    await expect(install()).rejects.toMatchObject({
      code: "templateInstallLeaseLost",
    })
  })
})

describe("failed install staged-object cleanup", () => {
  const prefixesOf = (generation: number) => [
    `workspaces/ws-1/ai-files/tpl-install-1/g${generation}/`,
    `public/space/ws-1/questionnaire-images/tpl-install-1/g${generation}/`,
    `public/space/ws-1/media-library/tpl-install-1/g${generation}/`,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.listObjects.mockImplementation((prefix: string) =>
      Promise.resolve({ Contents: [{ Key: `${prefix}abc` }] }),
    )
    mocks.claimStagedObjectsCleanup.mockResolvedValue({
      workspaceId: "ws-1",
      from: 0,
      to: 0,
    })
  })

  const failInput = {
    installationId: "install-1",
    workspaceId: "ws-1",
    claimToken: "token-1",
    errorCode: "templateInstallFailed",
    error: new Error("boom"),
  }

  test("a final failure deletes every object under the failed generation's prefixes but leaves it owed", async () => {
    mocks.fail.mockResolvedValue(true)

    await templateInstallService.fail(failInput)

    expect(mocks.listObjects.mock.calls.map((call) => call[0])).toEqual(
      prefixesOf(0),
    )
    expect(mocks.deleteObject.mock.calls.map((call) => call[0])).toEqual(
      prefixesOf(0).map((prefix) => `${prefix}abc`),
    )
    // A stale attempt of this generation may still write a key: only the
    // sweep, past the lease window, stamps the generation clean.
    expect(mocks.advanceStagedCleanedGeneration).not.toHaveBeenCalled()
    expect(mocks.releaseStagedObjectsCleanup).toHaveBeenCalledWith("install-1")
  })

  test("the sweep deletes a failed generation again and stamps it, catching a late write", async () => {
    mocks.fail.mockResolvedValue(true)
    await templateInstallService.fail(failInput)
    vi.clearAllMocks()
    mocks.deleteObject.mockResolvedValue(undefined)
    mocks.listObjects.mockImplementation((prefix: string) =>
      Promise.resolve({ Contents: [{ Key: `${prefix}late` }] }),
    )
    mocks.listWithStagedObjectsToClean.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
    ])
    mocks.claimStagedObjectsCleanup.mockResolvedValue({
      workspaceId: "ws-1",
      from: 0,
      to: 0,
    })

    await expect(templateInstallService.cleanupFailedObjects(10)).resolves.toBe(
      1,
    )

    expect(mocks.deleteObject.mock.calls.map((call) => call[0])).toEqual(
      prefixesOf(0).map((prefix) => `${prefix}late`),
    )
    expect(mocks.advanceStagedCleanedGeneration).toHaveBeenCalledWith({
      id: "install-1",
      from: 0,
      to: 0,
    })
  })

  test("cleaning generation n never lists or deletes another generation's keys", async () => {
    mocks.listWithStagedObjectsToClean.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
    ])
    mocks.claimStagedObjectsCleanup.mockResolvedValue({
      workspaceId: "ws-1",
      from: 1,
      to: 2,
    })

    await templateInstallService.cleanupFailedObjects(10)

    const listed = mocks.listObjects.mock.calls.map((call) => call[0])
    expect(listed).toEqual([...prefixesOf(1), ...prefixesOf(2)])
    // g1/ must not be a prefix of g10/…, and g3 (the retry) is never touched.
    expect(listed.some((prefix) => prefix.includes("/g0/"))).toBe(false)
    expect(listed.some((prefix) => prefix.includes("/g3/"))).toBe(false)
    expect(mocks.advanceStagedCleanedGeneration.mock.calls).toEqual([
      [{ id: "install-1", from: 1, to: 1 }],
      [{ id: "install-1", from: 2, to: 2 }],
    ])
  })

  test("a fenced-out failure never deletes (another attempt owns the row)", async () => {
    mocks.fail.mockResolvedValue(false)

    await templateInstallService.fail(failInput)

    expect(mocks.claimStagedObjectsCleanup).not.toHaveBeenCalled()
    expect(mocks.listObjects).not.toHaveBeenCalled()
    expect(mocks.deleteObject).not.toHaveBeenCalled()
  })

  test("a storage error during cleanup does not mask the recorded failure, and leaves it owed", async () => {
    mocks.fail.mockResolvedValue(true)
    mocks.listObjects.mockRejectedValue(new Error("storage down"))

    await expect(
      templateInstallService.fail(failInput),
    ).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalled()
    expect(mocks.advanceStagedCleanedGeneration).not.toHaveBeenCalled()
    expect(mocks.releaseStagedObjectsCleanup).toHaveBeenCalledWith("install-1")
  })

  test("a partial delete is not stamped clean, so the sweep retries it", async () => {
    mocks.fail.mockResolvedValue(true)
    mocks.deleteObject.mockRejectedValueOnce(new Error("denied"))

    await templateInstallService.fail(failInput)

    expect(mocks.advanceStagedCleanedGeneration).not.toHaveBeenCalled()
    expect(mocks.releaseStagedObjectsCleanup).toHaveBeenCalledWith("install-1")
  })

  test("the sweep cleans only the rows it manages to lease", async () => {
    mocks.listWithStagedObjectsToClean.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
      { id: "install-2", workspaceId: "ws-2" },
    ])
    mocks.claimStagedObjectsCleanup
      .mockResolvedValueOnce({ workspaceId: "ws-1", from: 0, to: 0 })
      .mockResolvedValueOnce(null)

    await expect(templateInstallService.cleanupFailedObjects(10)).resolves.toBe(
      1,
    )

    expect(mocks.listObjects.mock.calls.map((call) => call[0])).toEqual(
      prefixesOf(0),
    )
  })

  test("the sweep retries a cleanup that failed before: a later run stamps it", async () => {
    mocks.listWithStagedObjectsToClean.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
    ])
    mocks.deleteObject.mockRejectedValueOnce(new Error("denied"))
    await expect(templateInstallService.cleanupFailedObjects(10)).resolves.toBe(
      0,
    )
    expect(mocks.advanceStagedCleanedGeneration).not.toHaveBeenCalled()

    await expect(templateInstallService.cleanupFailedObjects(10)).resolves.toBe(
      1,
    )
    expect(mocks.advanceStagedCleanedGeneration).toHaveBeenCalledTimes(1)
  })
})
