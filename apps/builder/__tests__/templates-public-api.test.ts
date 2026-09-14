import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: {
  context: { workspace: { id: string; tenantId: string } }
  input: unknown
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: CapturedHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const templateService = {
  list: vi.fn(),
  listSelectableResources: vi.fn(),
  listInstallations: vi.fn(),
  createOrUpdate: vi.fn(),
  assertInstallable: vi.fn(),
  createInstallationRecord: vi.fn(),
  markInstallationFailed: vi.fn(),
  findByIdOrFail: vi.fn(),
  softDelete: vi.fn(),
  updateShareSettings: vi.fn(),
  updateInstallationAutoUpdate: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({ templateService }))

const { defaultQueue } = vi.hoisted(() => ({
  defaultQueue: { add: vi.fn() },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { installTemplate: "installTemplate" },
  defaultQueue,
}))

vi.mock("@/features/templates/schema/public", () => ({
  createTemplatePublicRequest: z.object({}),
  installTemplatePublicRequest: z.object({}),
  installTemplatePublicResponse: z.object({}),
  listSelectableTemplateResourcesPublicRequest: z.object({}),
  listSelectableTemplateResourcesPublicResponse: z.object({}),
  listTemplateInstallationsPublicResponse: z.object({}),
  listTemplatesPublicResponse: z.object({}),
  templateInstallationPublicResource: z.object({}),
  templatePublicRequestParams: z.object({}),
  templatePublicResource: z.object({}),
  updateTemplateInstallationAutoUpdatePublicRequest: z.object({}),
  updateTemplatePublicRequest: z.object({}),
  updateTemplateShareSettingsPublicRequest: z.object({}),
}))

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingResource: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingResource: {},
}))

await import("@/features/templates/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1", tenantId: "tenant-1" } }
const timestamp = new Date("2026-01-01T00:00:00.000Z")

const template = {
  id: "template-1",
  workspaceId: "publisher-workspace",
  tenantId: "publisher-tenant",
  createdBy: "user-1",
  payload: { formatVersion: 1 },
  name: "Welcome template",
  description: "A reusable welcome flow",
  imageUrl: null,
  publisherName: null,
  youtubeVideoId: null,
  testLink: null,
  shareEnabled: true,
  shareToken: "share-token",
  shareExpiresAt: null,
  categoryCounts: { flows: 1 },
  createInstallFolder: true,
  defaultAutoUpdate: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const publicTemplate = {
  id: template.id,
  name: template.name,
  description: template.description,
  imageUrl: template.imageUrl,
  publisherName: template.publisherName,
  youtubeVideoId: template.youtubeVideoId,
  testLink: template.testLink,
  shareEnabled: template.shareEnabled,
  shareToken: template.shareToken,
  shareExpiresAt: template.shareExpiresAt,
  categoryCounts: template.categoryCounts,
  createInstallFolder: template.createInstallFolder,
  defaultAutoUpdate: template.defaultAutoUpdate,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
}

const installation = {
  id: "installation-1",
  workspaceId: "workspace-1",
  templateId: "template-1",
  templateName: "Welcome template",
  status: "pending",
  warningCount: 0,
  errorMessage: null,
  resourceCount: 0,
  installFolderId: null,
  autoUpdate: false,
  sourceUpdatedAt: null,
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}

const publicInstallation = {
  id: installation.id,
  templateId: installation.templateId,
  templateName: installation.templateName,
  status: installation.status,
  warningCount: installation.warningCount,
  errorMessage: installation.errorMessage,
  resourceCount: installation.resourceCount,
  installFolderId: installation.installFolderId,
  autoUpdate: installation.autoUpdate,
  sourceUpdatedAt: installation.sourceUpdatedAt,
  completedAt: installation.completedAt,
  createdAt: installation.createdAt,
  updatedAt: installation.updatedAt,
}

const templateInput = {
  name: "Welcome template",
  description: "A reusable welcome flow",
  selection: { flows: { mode: "all" } },
  defaultPermissions: { allowEdit: true, allowDelete: false },
  createInstallFolder: true,
  defaultAutoUpdate: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the templates public router under the workspace scope", () => {
  expect(scopeArgAtImport).toBe("workspace")
})

describe("GET /v1/templates", () => {
  const procedure = findProcedure("GET", "/v1/templates")

  test("lists templates in the authenticated workspace", async () => {
    templateService.list.mockResolvedValueOnce([template])

    await expect(
      procedure.handler?.({ context, input: { page: 1, perPage: 50 } }),
    ).resolves.toEqual({ data: [publicTemplate], pageCount: 1 })

    expect(templateService.list).toHaveBeenCalledWith("workspace-1")
  })
})

describe("GET /v1/templates/selectable-resources", () => {
  const procedure = findProcedure("GET", "/v1/templates/selectable-resources")

  test("lists selectable resources in the authenticated workspace", async () => {
    const result = {
      items: [{ id: "flow-1", name: "Welcome flow", folderName: "Flows" }],
      nextCursor: "next-page",
      total: 2,
      allIds: ["flow-1", "flow-2"],
    }
    templateService.listSelectableResources.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: {
          category: "flows",
          keyword: "Welcome",
          cursor: "10",
          limit: 20,
        },
      }),
    ).resolves.toEqual(result)

    expect(templateService.listSelectableResources).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      category: "flows",
      keyword: "Welcome",
      cursor: "10",
      limit: 20,
    })
  })
})

describe("GET /v1/templates/installations", () => {
  const procedure = findProcedure("GET", "/v1/templates/installations")

  test("lists installation records in the authenticated workspace", async () => {
    templateService.listInstallations.mockResolvedValueOnce([installation])

    await expect(
      procedure.handler?.({ context, input: { page: 1, perPage: 50 } }),
    ).resolves.toEqual({ data: [publicInstallation], pageCount: 1 })

    expect(templateService.listInstallations).toHaveBeenCalledWith(
      "workspace-1",
    )
  })
})

describe("POST /v1/templates", () => {
  const procedure = findProcedure("POST", "/v1/templates")

  test("creates a template in the authenticated workspace without leaking internal fields", async () => {
    templateService.createOrUpdate.mockResolvedValueOnce(template)

    const result = await procedure.handler?.({ context, input: templateInput })

    expect(templateService.createOrUpdate).toHaveBeenCalledWith({
      ...templateInput,
      workspaceId: "workspace-1",
      tenantId: "tenant-1",
      createdBy: null,
    })
    expect(result).toEqual(publicTemplate)
    expect(result).not.toHaveProperty("payload")
    expect(result).not.toHaveProperty("tenantId")
    expect(result).not.toHaveProperty("workspaceId")
    expect(result).not.toHaveProperty("createdBy")
  })
})

describe("POST /v1/templates/installations", () => {
  const procedure = findProcedure("POST", "/v1/templates/installations")

  test("registers HTTP 202 semantics and queues an installation", async () => {
    templateService.assertInstallable.mockResolvedValueOnce({ template })
    templateService.createInstallationRecord.mockResolvedValueOnce(installation)
    defaultQueue.add.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { shareToken: "share-token" } }),
    ).resolves.toEqual({ installationId: "installation-1", status: "pending" })

    expect(procedure.route.successStatus).toBe(202)
    expect(templateService.assertInstallable).toHaveBeenCalledWith({
      shareToken: "share-token",
      targetWorkspaceId: "workspace-1",
    })
    expect(templateService.createInstallationRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      installedBy: null,
      template,
    })
    expect(defaultQueue.add).toHaveBeenCalledWith(
      "installTemplate",
      {
        type: "installTemplate",
        data: { installationId: "installation-1", workspaceId: "workspace-1" },
      },
      { jobId: "install-template-installation-1" },
    )
  })

  test("marks the installation failed before rethrowing a queue error", async () => {
    const queueError = new Error("queue unavailable")
    let releaseMarkInstallationFailure: (() => void) | undefined
    const markInstallationFailure = new Promise<void>((resolve) => {
      releaseMarkInstallationFailure = resolve
    })
    templateService.assertInstallable.mockResolvedValueOnce({ template })
    templateService.createInstallationRecord.mockResolvedValueOnce(installation)
    defaultQueue.add.mockRejectedValueOnce(queueError)
    templateService.markInstallationFailed.mockReturnValueOnce(
      markInstallationFailure,
    )

    const handlerPromise = procedure.handler?.({
      context,
      input: { shareToken: "share-token" },
    })
    let rejected = false
    handlerPromise?.catch(() => {
      rejected = true
    })

    await vi.waitFor(() => {
      expect(templateService.markInstallationFailed).toHaveBeenCalledWith({
        installationId: "installation-1",
        errorMessage: "Unable to queue template install",
      })
    })
    expect(rejected).toBe(false)

    if (!releaseMarkInstallationFailure) {
      throw new Error("Expected markInstallationFailed to be called")
    }
    releaseMarkInstallationFailure()

    await expect(handlerPromise).rejects.toThrow("queue unavailable")
  })
})

describe("GET /v1/templates/{id}", () => {
  const procedure = findProcedure("GET", "/v1/templates/{id}")

  test("gets a template scoped to the authenticated workspace", async () => {
    templateService.findByIdOrFail.mockResolvedValueOnce(template)

    await expect(
      procedure.handler?.({ context, input: { id: "template-1" } }),
    ).resolves.toEqual(publicTemplate)

    expect(templateService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      templateId: "template-1",
    })
  })
})

describe("PATCH /v1/templates/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/templates/{id}")

  test("updates a template in the authenticated workspace without leaking internal fields", async () => {
    templateService.createOrUpdate.mockResolvedValueOnce(template)

    const result = await procedure.handler?.({
      context,
      input: { id: "template-1", ...templateInput },
    })

    expect(templateService.createOrUpdate).toHaveBeenCalledWith({
      ...templateInput,
      workspaceId: "workspace-1",
      tenantId: "tenant-1",
      createdBy: null,
      existingTemplateId: "template-1",
    })
    expect(result).toEqual(publicTemplate)
    expect(result).not.toHaveProperty("payload")
    expect(result).not.toHaveProperty("tenantId")
    expect(result).not.toHaveProperty("workspaceId")
    expect(result).not.toHaveProperty("createdBy")
  })
})

describe("DELETE /v1/templates/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/templates/{id}")

  test("deletes the selected template in the authenticated workspace", async () => {
    templateService.softDelete.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "template-1" } }),
    ).resolves.toBeUndefined()

    expect(templateService.softDelete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      templateId: "template-1",
    })
  })
})

describe("PATCH /v1/templates/{id}/share-settings", () => {
  const procedure = findProcedure("PATCH", "/v1/templates/{id}/share-settings")

  test("updates sharing settings in the authenticated workspace", async () => {
    templateService.updateShareSettings.mockResolvedValueOnce(template)

    await expect(
      procedure.handler?.({
        context,
        input: {
          id: "template-1",
          shareEnabled: true,
          shareExpiresAt: "2026-12-31T00:00:00.000Z",
        },
      }),
    ).resolves.toEqual(publicTemplate)

    expect(templateService.updateShareSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      templateId: "template-1",
      shareEnabled: true,
      shareExpiresAt: new Date("2026-12-31T00:00:00.000Z"),
    })
  })
})

describe("PATCH /v1/templates/installations/{id}/auto-update", () => {
  const procedure = findProcedure(
    "PATCH",
    "/v1/templates/installations/{id}/auto-update",
  )

  test("updates an installation's auto-update setting in the authenticated workspace", async () => {
    templateService.updateInstallationAutoUpdate.mockResolvedValueOnce(
      undefined,
    )

    await expect(
      procedure.handler?.({
        context,
        input: { id: "installation-1", autoUpdate: true },
      }),
    ).resolves.toBeUndefined()

    expect(templateService.updateInstallationAutoUpdate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      installationId: "installation-1",
      autoUpdate: true,
    })
  })
})
