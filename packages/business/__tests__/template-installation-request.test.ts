// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Revocation cleanup has its own suites (unit and real-DB).
vi.mock("../src/template/uninstall-cancel.service", () => ({
  templateUninstallCancelService: {
    cancelPublisherUninstalls: vi.fn().mockResolvedValue(undefined),
  },
}))

const mocks = vi.hoisted(() => ({
  assertInstallable: vi.fn(),
  findLive: vi.fn(),
  lock: vi.fn(),
  syncRequest: vi.fn(),
  setGrant: vi.fn(),
  assertPair: vi.fn(),
  findGrant: vi.fn(),
  findLatest: vi.fn(),
  findActive: vi.fn(),
  findInstalled: vi.fn(),
  assertInstallableById: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  resetFailed: vi.fn(),
  listPage: vi.fn(),
  loadLabels: vi.fn(),
  listInboxes: vi.fn(),
  listConnected: vi.fn(),
  findPayload: vi.fn(),
  isUniqueViolation: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (callback: (tx: object) => unknown) => callback({}),
  },
  isUniqueViolationError: (...args: unknown[]) =>
    mocks.isUniqueViolation(...args),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  loadResourceLabels: (...args: unknown[]) => mocks.loadLabels(...args),
  inboxRepository: {
    listIdentitiesByIds: (...args: unknown[]) => mocks.listInboxes(...args),
    listConnectedIdentitiesByChannels: (...args: unknown[]) =>
      mocks.listConnected(...args),
  },
  templateVersionRepository: {
    lockVersions: vi.fn(),
    find: async (input: { version: number }) => ({ version: input.version }),
    findLatest: async () => ({ version: 9 }),
  },
  templateRepository: {
    findInboxManifestByShareToken: (...args: unknown[]) =>
      mocks.findPayload(...args),
    findLiveByShareToken: (...args: unknown[]) => mocks.findLive(...args),
  },
  templateInstallationRepository: {
    lockInstallRequest: (...args: unknown[]) => mocks.lock(...args),
    findPublisherRef: () => Promise.resolve(null),
    findPublisherUninstallGrant: (...args: unknown[]) =>
      mocks.findGrant(...args),
    setPublisherUninstallGrant: (...args: unknown[]) => mocks.setGrant(...args),
    findLatestBySourceTemplate: (...args: unknown[]) =>
      mocks.findLatest(...args),
    findActiveBySourceTemplate: (...args: unknown[]) =>
      mocks.findActive(...args),
    findInstalledBySourceTemplate: (...args: unknown[]) =>
      mocks.findInstalled(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    findByIdAndWorkspace: (...args: unknown[]) => mocks.findById(...args),
    resetFailed: (...args: unknown[]) => mocks.resetFailed(...args),
  },
  templateInstalledResourceRepository: {
    listPage: (...args: unknown[]) => mocks.listPage(...args),
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createId: () => "new-id",
}))

vi.mock("../src/template/sync-request.service", () => ({
  templateSyncRequestService: { request: mocks.syncRequest },
  assertCanManagePair: mocks.assertPair,
}))
vi.mock("../src/user", () => ({
  userService: { findNameAndEmail: vi.fn(async () => ({ name: "Ada" })) },
}))

vi.mock("../src/template/service", async () => {
  const { ChatbotXException } = await import("../src/errors")
  return {
    templateService: {
      assertInstallable: (...args: unknown[]) =>
        mocks.assertInstallable(...args),
      assertInstallableById: (...args: unknown[]) =>
        mocks.assertInstallableById(...args),
    },
    templateShareDisabledException: () =>
      new ChatbotXException("gone", "templateShareDisabled"),
    toPublicProjection: (row: { name: string }) => ({ name: row.name }),
  }
})

const { templateInstallationRequestService: service } = await import(
  "../src/template/installation-request.service"
)
const { ChatbotXException } = await import("../src/errors")

const template = {
  id: "t-1",
  workspaceId: "src-ws",
  name: "Welcome",
  formatVersion: 1,
  defaultPermissions: { allowEdit: true, allowDelete: true },
  defaultAutoUpdate: false,
  updatedAt: new Date(),
  version: 3,
}
const PUBLISHER_REF_FORMAT = /^[0-9a-f]{32}$/
const request = {
  shareToken: "tok",
  targetWorkspaceId: "ws-1",
  installedBy: "user-1",
  actor: { kind: "apiToken" as const, permission: "full" as const },
}
const row = (status: string, id = "inst-1") => ({
  id,
  workspaceId: "ws-1",
  status,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertInstallable.mockResolvedValue({
    template,
    payload: { manifests: { inboxes: {} } },
  })
  mocks.listInboxes.mockResolvedValue([])
  mocks.findLatest.mockResolvedValue(null)
  mocks.findActive.mockResolvedValue(null)
  mocks.findInstalled.mockResolvedValue(null)
  mocks.assertInstallableById.mockResolvedValue({
    template,
    payload: { manifests: { inboxes: {} } },
  })
  mocks.create.mockImplementation(async (values) => values)
  mocks.isUniqueViolation.mockReturnValue(false)
  mocks.findGrant.mockResolvedValue(null)
})

describe("templateInstallationRequestService.request", () => {
  test("creates a pending installation under the per-template lock", async () => {
    const { installation, created } = await service.request(request)

    expect(created).toBe(true)
    expect(installation).toMatchObject({
      workspaceId: "ws-1",
      sourceTemplateId: "t-1",
      status: "pending",
      installedBy: "user-1",
      sourceVersion: 3,
      publisherUninstallGrant: 1,
      publisherRef: expect.stringMatching(PUBLISHER_REF_FORMAT),
    })
    expect(mocks.lock).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "t-1" },
      expect.anything(),
    )
  })

  test("an explicit consent choice at install time applies to the whole pair", async () => {
    await service.request({ ...request, acceptPublisherUninstall: false })
    // The choice reaches every copy of the pair, so it needs the permission of all of them.
    expect(mocks.assertPair).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "t-1" },
      request.actor,
      expect.anything(),
    )
    expect(mocks.setGrant).toHaveBeenCalledWith(
      { workspaceId: "ws-1", sourceTemplateId: "t-1", granted: false },
      expect.anything(),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherUninstallGrant: 0 }),
      expect.anything(),
    )
  })

  test("a new install that says nothing keeps an earlier opt-out", async () => {
    mocks.findGrant.mockResolvedValue(0)
    await service.request(request)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ publisherUninstallGrant: 0 }),
      expect.anything(),
    )
  })

  test("a reinstall passes the consent choice on to the sync", async () => {
    mocks.findInstalled.mockResolvedValue(row("completed", "inst-9"))
    mocks.syncRequest.mockResolvedValue({
      syncId: "sync-1",
      workspaceId: "ws-1",
      created: true,
    })
    await service.request({ ...request, acceptPublisherUninstall: false })
    expect(mocks.syncRequest).toHaveBeenCalledWith(
      expect.objectContaining({ acceptPublisherUninstall: false }),
    )
  })

  test("returns the install already in flight instead of creating another", async () => {
    mocks.findActive.mockResolvedValue(row("installing"))

    const result = await service.request(request)

    expect(result).toEqual({ installation: row("installing"), created: false })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("follows the in-flight install even when a newer row failed", async () => {
    // A retried older row is active while the newest row is `failed`.
    mocks.findActive.mockResolvedValue(row("pending", "older"))
    mocks.findLatest.mockResolvedValue(row("failed", "newest"))

    const result = await service.request(request)

    expect(result.installation).toEqual(row("pending", "older"))
    expect(result.created).toBe(false)
  })

  test.each([
    "completed",
    "partial",
  ])("updates a template already %s here in place instead of installing again", async (status) => {
    mocks.findInstalled.mockResolvedValue(row(status, "inst-9"))
    mocks.syncRequest.mockResolvedValue({
      syncId: "sync-1",
      workspaceId: "ws-1",
      created: true,
    })

    const result = await service.request({ ...request, autoUpdate: false })

    expect(result).toMatchObject({
      created: false,
      syncId: "sync-1",
      installation: { id: "inst-9" },
    })
    expect(mocks.syncRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "inst-9",
        trigger: "reinstall",
        autoUpdate: false,
      }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("allowDuplicate installs another copy of an installed template", async () => {
    mocks.findInstalled.mockResolvedValue(row("completed"))

    const { created } = await service.request({
      ...request,
      allowDuplicate: true,
    })

    expect(created).toBe(true)
  })

  test("a failed install does not block a new one", async () => {
    mocks.findLatest.mockResolvedValue(row("failed"))

    expect((await service.request(request)).created).toBe(true)
  })

  test("loses a race to the unique index by returning the active row", async () => {
    const violation = new Error("duplicate")
    mocks.create.mockRejectedValue(violation)
    mocks.isUniqueViolation.mockImplementation(
      (error: unknown, constraint?: string) =>
        error === violation &&
        constraint ===
          "TemplateInstallation_workspaceId_sourceTemplateId_active_key",
    )
    mocks.findActive
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row("pending", "winner"))

    const result = await service.request(request)

    expect(result).toEqual({
      installation: row("pending", "winner"),
      created: false,
    })
  })

  test("rethrows any other insert failure", async () => {
    mocks.create.mockRejectedValue(new Error("boom"))

    await expect(service.request(request)).rejects.toThrow("boom")
  })

  describe("inbox bindings", () => {
    const manifest = { "src-1": { channelType: "messenger", name: "Page A" } }
    const withInboxes = () =>
      mocks.assertInstallable.mockResolvedValue({
        template,
        payload: { manifests: { inboxes: manifest } },
      })

    test("stores a binding to a connected inbox of the same channel", async () => {
      withInboxes()
      mocks.listInboxes.mockResolvedValue([
        {
          id: "tgt-1",
          name: "My page",
          channel: "messenger",
          status: "connected",
        },
      ])

      const { installation } = await service.request({
        ...request,
        inboxBindings: { "src-1": "tgt-1" },
      })

      expect(installation).toMatchObject({
        inboxBindings: { "src-1": "tgt-1" },
      })
    })

    test("records no bindings when the installer chose none", async () => {
      withInboxes()

      const { installation } = await service.request(request)

      expect(installation).toMatchObject({ inboxBindings: null })
    })

    test.each([
      ["an inbox of another channel", "instagram", "connected"],
      ["a disconnected inbox", "messenger", "disconnected"],
    ])("rejects %s", async (_label, channel, status) => {
      withInboxes()
      mocks.listInboxes.mockResolvedValue([
        { id: "tgt-1", name: "x", channel, status },
      ])

      await expect(
        service.request({ ...request, inboxBindings: { "src-1": "tgt-1" } }),
      ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
      expect(mocks.create).not.toHaveBeenCalled()
    })

    test("rejects an inbox that is not in the target workspace", async () => {
      withInboxes()
      // The lookup is scoped to the target workspace, so a foreign id is absent.
      mocks.listInboxes.mockResolvedValue([])

      await expect(
        service.request({ ...request, inboxBindings: { "src-1": "foreign" } }),
      ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
    })

    test("rejects a binding for an inbox the template does not name", async () => {
      withInboxes()
      mocks.listInboxes.mockResolvedValue([
        { id: "tgt-1", name: "x", channel: "messenger", status: "connected" },
      ])

      await expect(
        service.request({ ...request, inboxBindings: { unknown: "tgt-1" } }),
      ).rejects.toMatchObject({ code: "templateInvalidInboxBinding" })
    })
  })

  test("an API-token install records no installing user", async () => {
    const { installation } = await service.request({
      ...request,
      installedBy: null,
    })

    expect(installation).toMatchObject({
      installedBy: null,
      installedByKind: "apiToken",
    })
  })

  test("a member install records the member kind, which outlives a user delete", async () => {
    const { installation } = await service.request(request)

    expect(installation).toMatchObject({
      installedBy: "user-1",
      installedByKind: "member",
    })
  })
})

describe("templateInstallationRequestService.retry", () => {
  const input = {
    installationId: "inst-1",
    workspaceId: "ws-1",
    actor: request.actor,
    retriedBy: "user-2",
  }
  const failed = {
    ...row("failed"),
    templateId: "t-1",
    sourceTemplateId: "t-1",
  }

  test("puts a failed installation back to pending with the retrier as installer", async () => {
    mocks.findById.mockResolvedValue(failed)
    mocks.resetFailed.mockResolvedValue(row("pending"))

    await expect(service.retry(input)).resolves.toEqual(row("pending"))
    expect(mocks.resetFailed).toHaveBeenCalledWith(
      {
        id: "inst-1",
        workspaceId: "ws-1",
        installedBy: "user-2",
        installedByKind: "member",
        // Re-pinned to the newest version, not the one that already failed.
        sourceVersion: 9,
      },
      expect.anything(),
    )
    expect(mocks.assertInstallableById).toHaveBeenCalledWith({
      templateId: "t-1",
      targetWorkspaceId: "ws-1",
      actor: input.actor,
    })
  })

  test("only a failed installation can be retried", async () => {
    mocks.findById.mockResolvedValue({ ...failed, status: "completed" })

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateInstallationNotRetryable",
    })
    expect(mocks.resetFailed).not.toHaveBeenCalled()
  })

  test("an unknown installation is not found", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(service.retry(input)).rejects.toThrow()
  })

  test("a retry is refused once the template is no longer shared or installable", async () => {
    mocks.findById.mockResolvedValue(failed)
    mocks.assertInstallableById.mockRejectedValue(
      new ChatbotXException("gone", "templateShareDisabled"),
    )

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateShareDisabled",
    })
    expect(mocks.resetFailed).not.toHaveBeenCalled()
  })

  test("a retry whose template was deleted fails with the missing-source code", async () => {
    mocks.findById.mockResolvedValue({ ...failed, templateId: null })

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateInstallationSourceMissing",
    })
  })

  test("a retry does not create a second copy next to an installed one", async () => {
    mocks.findById.mockResolvedValue(failed)
    mocks.findInstalled.mockResolvedValue(row("completed", "inst-7"))

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateAlreadyInstalled",
      data: { installationId: "inst-7" },
    })
    expect(mocks.resetFailed).not.toHaveBeenCalled()
  })

  test("a retry while another install is in flight is refused", async () => {
    mocks.findById.mockResolvedValue(failed)
    mocks.findActive.mockResolvedValue(row("pending", "other"))

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateInstallationNotRetryable",
    })
  })

  test("a retry that collides with the unique index is refused", async () => {
    mocks.findById.mockResolvedValue(failed)
    mocks.resetFailed.mockRejectedValue(new Error("duplicate"))
    mocks.isUniqueViolation.mockReturnValue(true)

    await expect(service.retry(input)).rejects.toMatchObject({
      code: "templateInstallationNotRetryable",
    })
  })
})

describe("templateInstallationRequestService.preview", () => {
  test("is installable with the existing installation, if any", async () => {
    mocks.findLatest.mockResolvedValue(row("completed", "inst-4"))

    await expect(
      service.preview({
        shareToken: "tok",
        targetWorkspaceId: "ws-1",
        actor: request.actor,
      }),
    ).resolves.toEqual({
      installable: true,
      template: { name: "Welcome" },
      requiredInboxes: [],
      requiredChannels: [],
      existingInstallation: { id: "inst-4", status: "completed" },
      publisherUninstallDisclosure: {
        version: 1,
        publisherSees: ["workspaceName", "installCounts", "uninstallCounts"],
        publisherCan: ["uninstall"],
        uninstallDeletes: expect.stringContaining("copies you edited"),
      },
    })
  })

  test("lists the inboxes the template needs and their channels", async () => {
    mocks.assertInstallable.mockResolvedValue({
      template,
      payload: {
        manifests: {
          inboxes: {
            a: { channelType: "messenger", name: "Page A" },
            b: { channelType: "messenger", name: "Page B" },
            c: { channelType: "instagram", name: "IG" },
          },
        },
      },
    })

    const result = await service.preview({
      shareToken: "tok",
      targetWorkspaceId: "ws-1",
      actor: request.actor,
    })

    expect(result).toMatchObject({
      installable: true,
      requiredChannels: ["messenger", "instagram"],
      requiredInboxes: [
        { sourceId: "a", channelType: "messenger", name: "Page A" },
        { sourceId: "b", channelType: "messenger", name: "Page B" },
        { sourceId: "c", channelType: "instagram", name: "IG" },
      ],
    })
  })

  test("reports a business rejection as a reason, not an error", async () => {
    mocks.assertInstallable.mockRejectedValue(
      new ChatbotXException("nope", "templateCrossTenantInstall", 400),
    )

    await expect(
      service.preview({
        shareToken: "tok",
        targetWorkspaceId: "ws-1",
        actor: request.actor,
      }),
    ).resolves.toEqual({
      installable: false,
      reason: "templateShareDisabled",
    })
  })

  test("keeps a permission rejection distinct from an unusable link", async () => {
    mocks.assertInstallable.mockRejectedValue(
      new ChatbotXException("no", "templateCategoryPermissionDenied", 403),
    )

    await expect(
      service.preview({
        shareToken: "tok",
        targetWorkspaceId: "ws-1",
        actor: request.actor,
      }),
    ).resolves.toEqual({
      installable: false,
      reason: "templateCategoryPermissionDenied",
    })
  })

  test("does not swallow an unexpected failure", async () => {
    mocks.assertInstallable.mockRejectedValue(new Error("db down"))

    await expect(
      service.preview({
        shareToken: "tok",
        targetWorkspaceId: "ws-1",
        actor: request.actor,
      }),
    ).rejects.toThrow("db down")
  })
})

describe("templateInstallationRequestService.listResources", () => {
  test("labels a page of resources with one batched lookup and flags locked ones", async () => {
    mocks.findById.mockResolvedValue({
      ...row("completed"),
      templateId: "t-1",
      sourceDeletedAt: null,
    })
    mocks.listPage.mockResolvedValue({
      nextCursor: "r2",
      rows: [
        {
          id: "r1",
          category: "flows",
          resourceKind: "flow",
          resourceId: "f1",
          wasExisting: false,
          allowEdit: false,
          detachedAt: null,
        },
        {
          id: "r2",
          category: "tags",
          resourceKind: "tag",
          resourceId: "g1",
          wasExisting: true,
          allowEdit: false,
          detachedAt: null,
        },
      ],
    })
    mocks.loadLabels.mockResolvedValue(new Map([["flow:f1", "Welcome flow"]]))

    const page = await service.listResources({
      installationId: "inst-1",
      workspaceId: "ws-1",
      limit: 2,
    })

    expect(mocks.loadLabels).toHaveBeenCalledTimes(1)
    expect(page.nextCursor).toBe("r2")
    expect(page.items).toEqual([
      expect.objectContaining({
        resourceId: "f1",
        label: "Welcome flow",
        created: true,
        locked: true,
      }),
      // A reused row is the installer's own and never locked.
      expect.objectContaining({
        resourceId: "g1",
        label: null,
        created: false,
        locked: false,
      }),
    ])
  })

  test("reports nothing as view-only once the source template is deleted", async () => {
    mocks.findById.mockResolvedValue({
      ...row("completed"),
      templateId: null,
      sourceDeletedAt: new Date(),
    })
    mocks.listPage.mockResolvedValue({
      nextCursor: null,
      rows: [
        {
          id: "r1",
          category: "flows",
          resourceKind: "flow",
          resourceId: "f1",
          wasExisting: false,
          allowEdit: false,
          detachedAt: null,
        },
      ],
    })
    mocks.loadLabels.mockResolvedValue(new Map())

    const page = await service.listResources({
      installationId: "inst-1",
      workspaceId: "ws-1",
    })

    expect(page.items[0]).toMatchObject({ locked: false })
  })
})

describe("templateInstallationRequestService.listBindableInboxes", () => {
  test("groups the connected inboxes of all workspaces from one query", async () => {
    mocks.listConnected.mockResolvedValue([
      { id: "i1", name: "A", channel: "messenger", workspaceId: "ws-1" },
      { id: "i2", name: "B", channel: "messenger", workspaceId: "ws-2" },
      { id: "i3", name: "C", channel: "messenger", workspaceId: "ws-1" },
    ])

    await expect(
      service.listBindableInboxes({
        workspaceIds: ["ws-1", "ws-2", "ws-3"],
        channels: ["messenger"],
      }),
    ).resolves.toEqual({
      "ws-1": [
        { id: "i1", name: "A", channel: "messenger" },
        { id: "i3", name: "C", channel: "messenger" },
      ],
      "ws-2": [{ id: "i2", name: "B", channel: "messenger" }],
      "ws-3": [],
    })
    expect(mocks.listConnected).toHaveBeenCalledTimes(1)
  })
})

describe("templateInstallationRequestService.findInboxManifestByShareToken", () => {
  test.each([
    ["no such link", undefined],
    ["sharing switched off", { shareEnabled: false, shareExpiresAt: null }],
    [
      "an expired link",
      { shareEnabled: true, shareExpiresAt: new Date(Date.now() - 1000) },
    ],
  ])("is empty for %s", async (_label, row) => {
    mocks.findPayload.mockResolvedValue(row)

    await expect(service.findInboxManifestByShareToken("tok")).resolves.toEqual(
      [],
    )
  })

  test("is empty when the saved payload no longer parses", async () => {
    mocks.findPayload.mockResolvedValue({
      shareEnabled: true,
      shareExpiresAt: null,
      inboxes: { i1: { nope: true } },
    })

    await expect(service.findInboxManifestByShareToken("tok")).resolves.toEqual(
      [],
    )
  })

  test("returns the manifest's inboxes for a live link", async () => {
    mocks.findPayload.mockResolvedValue({
      shareEnabled: true,
      shareExpiresAt: null,
      inboxes: { i1: { channelType: "messenger", name: "Main" } },
    })

    await expect(service.findInboxManifestByShareToken("tok")).resolves.toEqual(
      [{ sourceId: "i1", channelType: "messenger", name: "Main" }],
    )
  })

  test("is empty when the template has no inbox manifest", async () => {
    mocks.findPayload.mockResolvedValue({
      shareEnabled: true,
      shareExpiresAt: null,
      inboxes: null,
    })

    await expect(service.findInboxManifestByShareToken("tok")).resolves.toEqual(
      [],
    )
  })
})

describe("templateInstallationRequestService.filterInstallableWorkspaces", () => {
  const member = (id: string, tenantId: string, flows: boolean) => ({
    workspace: { id, tenantId, name: `ws ${id}` },
    permissions: { flows } as never,
  })
  const liveTemplate = {
    tenantId: "t-1",
    shareEnabled: true,
    shareExpiresAt: null,
    categoryCounts: { flows: 2 },
  }

  test("keeps the template's tenant and the members who may use every category", async () => {
    mocks.findLive.mockResolvedValue(liveTemplate)

    const workspaces = await service.filterInstallableWorkspaces({
      shareToken: "tok",
      members: [
        member("a", "t-1", true),
        member("b", "t-2", true),
        member("c", "t-1", false),
      ],
    })

    expect(workspaces.map((workspace) => workspace.id)).toEqual(["a"])
  })

  test("an unusable link offers no workspace", async () => {
    mocks.findLive.mockResolvedValue({ ...liveTemplate, shareEnabled: false })

    await expect(
      service.filterInstallableWorkspaces({
        shareToken: "tok",
        members: [member("a", "t-1", true)],
      }),
    ).resolves.toEqual([])
  })
})
