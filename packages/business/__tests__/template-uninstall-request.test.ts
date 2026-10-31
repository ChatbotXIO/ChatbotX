// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  lockInstall: vi.fn(),
  listInstalled: vi.fn(),
  createOperation: vi.fn(),
  request: vi.fn(),
  resetFailed: vi.fn(),
  enqueue: vi.fn(),
  listActive: vi.fn(),
  templateFindFirst: vi.fn(),
  workspaceFindFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      templateModel: { findFirst: mocks.templateFindFirst },
      workspaceModel: { findFirst: mocks.workspaceFindFirst },
    },
    transaction: (callback: (client: unknown) => unknown) => callback({}),
  },
}))
vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    findByIdAndWorkspace: mocks.find,
    lockInstallRequest: mocks.lockInstall,
    listActiveByPublisherRef: mocks.listActive,
  },
  templateInstallationSyncRepository: {
    listInstalledResources: mocks.listInstalled,
  },
  templateUninstallStateRepository: {
    createOperation: mocks.createOperation,
    request: mocks.request,
    resetFailedToDeleting: mocks.resetFailed,
    countOutcomes: vi.fn(),
    listTombstones: vi.fn(),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueUninstallTemplate: mocks.enqueue,
}))
vi.mock("../src/template/adapters/uninstall-handlers", () => ({
  UNINSTALL_HANDLER_BY_KIND: { flow: {} },
}))
vi.mock("../src/template/uninstall-decide", () => ({
  countDecisions: vi.fn(),
  decideUninstall: vi.fn(),
  undecidedRows: vi.fn(),
}))

const { templateUninstallService } = await import(
  "../src/template/uninstall.service"
)

const member = {
  kind: "member" as const,
  permissions: { flows: true } as never,
}
const full = { kind: "apiToken" as const, permission: "full" as const }
const installation = (overrides: Record<string, unknown> = {}) => ({
  id: "i1",
  workspaceId: "w1",
  templateId: "t1",
  sourceTemplateId: "t1",
  publisherRef: "ref",
  status: "completed",
  uninstallState: "none",
  uninstallOperationId: null,
  publisherUninstallGrant: 1,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue(installation())
  mocks.listInstalled.mockResolvedValue([])
  mocks.createOperation.mockResolvedValue({ id: "op1" })
  mocks.request.mockResolvedValue({ attempt: 1, workspaceId: "w1" })
  mocks.enqueue.mockResolvedValue(undefined)
})

describe("requesting an uninstall", () => {
  test("records the request durably under the install lock, then enqueues with the attempt", async () => {
    const result = await templateUninstallService.uninstallAsInstaller({
      workspaceId: "w1",
      installationId: "i1",
      actor: full,
    })

    expect(result).toEqual({
      installations: 1,
      operationId: "op1",
      uninstallState: "pending",
    })
    expect(mocks.lockInstall).toHaveBeenCalled()
    expect(mocks.enqueue).toHaveBeenCalledWith({
      installationId: "i1",
      workspaceId: "w1",
      attempt: 1,
    })
  })

  test("the requesting member is recorded on the operation and the installation", async () => {
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: "w1",
      installationId: "i1",
      actor: full,
      requestedBy: "user-7",
    })

    expect(mocks.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: "user-7" }),
      expect.anything(),
    )
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: "user-7" }),
      expect.anything(),
    )
  })

  test("without an explicit user the audit actor of the request is used", async () => {
    const { withAuditContext } = await import("../src/audit/context")

    await withAuditContext(
      { userId: "owner-3", workspaceId: "w1", source: "api" },
      async () =>
        await templateUninstallService.uninstallAsInstaller({
          workspaceId: "w1",
          installationId: "i1",
          actor: full,
        }),
    )

    expect(mocks.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: "owner-3" }),
      expect.anything(),
    )
  })

  test("a retry resets only the failed outcomes and creates a new operation", async () => {
    mocks.find.mockResolvedValue(
      installation({ status: "partial", uninstallState: "partial" }),
    )

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: "w1",
      installationId: "i1",
      actor: full,
    })

    expect(mocks.createOperation).toHaveBeenCalledTimes(1)
    expect(mocks.resetFailed).toHaveBeenCalledWith("i1", expect.anything())
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ id: "i1", operationId: "op1" }),
      expect.anything(),
    )
  })

  test("a repeat while the operation is in flight returns it and enqueues nothing", async () => {
    mocks.find.mockResolvedValue(
      installation({ uninstallState: "running", uninstallOperationId: "op0" }),
    )

    const result = await templateUninstallService.uninstallAsInstaller({
      workspaceId: "w1",
      installationId: "i1",
      actor: full,
    })

    expect(result.operationId).toBe("op0")
    expect(mocks.createOperation).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a failed enqueue does not fail the request (the sweep recovers it)", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(
      templateUninstallService.uninstallAsInstaller({
        workspaceId: "w1",
        installationId: "i1",
        actor: full,
      }),
    ).resolves.toMatchObject({ uninstallState: "pending" })
  })

  test("a read-only token can not request", async () => {
    await expect(
      templateUninstallService.uninstallAsInstaller({
        workspaceId: "w1",
        installationId: "i1",
        actor: { kind: "apiToken", permission: "read_only" },
      }),
    ).rejects.toBeDefined()
    expect(mocks.createOperation).not.toHaveBeenCalled()
  })

  test("an installation tracking more than 200 copies is rejected up front", async () => {
    mocks.listInstalled.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) => ({
        resourceKind: "flow",
        category: "flows",
        resourceId: String(index),
        wasExisting: false,
        detachedAt: null,
      })),
    )

    await expect(
      templateUninstallService.uninstallAsInstaller({
        workspaceId: "w1",
        installationId: "i1",
        actor: member,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallTooLarge" })
  })

  test("a publisher is refused when any installation lacks the grant", async () => {
    mocks.templateFindFirst.mockResolvedValue({ id: "t1", tenantId: "1" })
    mocks.listActive.mockResolvedValue([
      installation(),
      installation({ id: "i2", publisherUninstallGrant: 0 }),
    ])

    await expect(
      templateUninstallService.uninstallAsPublisher({
        workspaceId: "src",
        templateId: "t1",
        publisherRef: "ref",
        actor: full,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallNotGranted" })
  })

  test("a publisher uninstall is one operation for every installation of the group", async () => {
    mocks.templateFindFirst.mockResolvedValue({ id: "t1", tenantId: "1" })
    mocks.workspaceFindFirst.mockResolvedValue({ tenantId: "1" })
    mocks.listActive.mockResolvedValue([
      installation(),
      installation({ id: "i2" }),
    ])
    mocks.find.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(installation({ id })),
    )

    const result = await templateUninstallService.uninstallAsPublisher({
      workspaceId: "src",
      templateId: "t1",
      publisherRef: "ref",
      actor: full,
    })

    expect(result.installations).toBe(2)
    expect(mocks.createOperation).toHaveBeenCalledTimes(1)
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
  })

  test("the publisher must be in a tenant matching the installer's", async () => {
    mocks.templateFindFirst.mockResolvedValue({ id: "t1", tenantId: "1" })
    mocks.workspaceFindFirst.mockResolvedValue({ tenantId: "2" })
    mocks.listActive.mockResolvedValue([installation()])

    await expect(
      templateUninstallService.uninstallAsPublisher({
        workspaceId: "src",
        templateId: "t1",
        publisherRef: "ref",
        actor: full,
      }),
    ).rejects.toBeDefined()
    expect(mocks.createOperation).not.toHaveBeenCalled()
  })
})

describe("publisher uninstall access by token power", () => {
  const readOnly = {
    kind: "apiToken" as const,
    permission: "read_only" as const,
  }

  test("a read-only token passes the gate of a publisher uninstall preview", async () => {
    mocks.templateFindFirst.mockResolvedValue({ id: "t1", tenantId: "1" })
    mocks.workspaceFindFirst.mockResolvedValue({ tenantId: "1" })
    mocks.listActive.mockResolvedValue([installation()])

    // The counting below the gate needs more fixtures than this test cares
    // about; reaching the installation lookup proves the gate let it through.
    const outcome = await templateUninstallService
      .previewAsPublisher({
        workspaceId: "src",
        templateId: "t1",
        publisherRef: "ref",
        actor: readOnly,
      })
      .catch((error: unknown) => error)

    expect(outcome).not.toMatchObject({
      code: "templateManagePermissionDenied",
    })
    expect(mocks.listActive).toHaveBeenCalled()
  })

  test("a member without the manage permission is refused the preview", async () => {
    await expect(
      templateUninstallService.previewAsPublisher({
        workspaceId: "src",
        templateId: "t1",
        publisherRef: "ref",
        actor: { kind: "member", permissions: { ecommerce: true } as never },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
  })

  test("a read-only token is refused the publisher uninstall itself", async () => {
    await expect(
      templateUninstallService.uninstallAsPublisher({
        workspaceId: "src",
        templateId: "t1",
        publisherRef: "ref",
        actor: readOnly,
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mocks.createOperation).not.toHaveBeenCalled()
  })
})
