import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (args: {
  context: {
    workspace: { id: string }
    apiToken: { id: string; scopes: string[] | null }
  }
  input: Record<string, unknown>
}) => Promise<unknown>

type CapturedProcedure = {
  route: RouteConfig
  errors?: Record<string, { message: string; status: number }>
  handler?: ProcedureHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures, service } =
  vi.hoisted(() => {
    const capturedProcedures: CapturedProcedure[] = []
    const makeProcedure = (route: RouteConfig) => {
      const record: CapturedProcedure = { route }
      capturedProcedures.push(record)
      const chain = {
        input: vi.fn(() => chain),
        output: vi.fn(() => chain),
        errors: vi.fn((errors: CapturedProcedure["errors"]) => {
          record.errors = errors
          return chain
        }),
        handler: vi.fn((fn: ProcedureHandler) => {
          record.handler = fn
          return { handler: fn }
        }),
      }
      return chain
    }
    const api = { route: vi.fn((config: RouteConfig) => makeProcedure(config)) }
    return {
      workspaceTokenAuthAPIForScope: vi.fn((_scope: string) => api),
      capturedProcedures,
      service: {
        listSources: vi.fn(),
        getSchema: vi.fn(),
        saveMappings: vi.fn(),
        getAvailability: vi.fn(),
        schedule: vi.fn(),
        listHistory: vi.fn(),
        get: vi.fn(),
        cancel: vi.fn(),
        scheduleConnectImport: vi.fn(),
        retryHistory: vi.fn(),
      },
    }
  })

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))
vi.mock("@chatbotx.io/business", () => ({ contactSyncService: service }))

await import("@/features/contact-sync/api/public")
const errorHelper = await import("@/lib/orpc/orpc-error-helper")
const schema = await import("@/features/contact-sync/schema/public")

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

const find = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const ACTOR = { type: "api_token", id: "tok-1" }
const ctx = {
  workspace: { id: "workspace-1" },
  apiToken: { id: "tok-1", scopes: null },
}

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the contact sync public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

test("registers all ten procedures", () => {
  expect(
    capturedProcedures.map((p) => `${p.route.method} ${p.route.path}`).sort(),
  ).toEqual(
    [
      "GET /v1/contact-syncs/sources",
      "GET /v1/contact-syncs/sources/{inboxId}/schema",
      "PUT /v1/contact-syncs/sources/{inboxId}/mappings",
      "GET /v1/contact-syncs/availability",
      "POST /v1/contact-syncs",
      "GET /v1/contact-syncs",
      "GET /v1/contact-syncs/{runId}",
      "POST /v1/contact-syncs/{runId}/cancel",
      "POST /v1/contact-syncs/connect-import",
      "POST /v1/contact-syncs/sources/{inboxId}/retry-history",
    ].sort(),
  )
})

describe("GET /v1/contact-syncs/sources", () => {
  const procedure = find("GET", "/v1/contact-syncs/sources")

  test("lists sources of the token workspace, ignoring a client workspaceId", async () => {
    service.listSources.mockResolvedValueOnce([{ inboxId: "c1" }])

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { provider: "ahachat", workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ data: [{ inboxId: "c1" }] })

    expect(service.listSources).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actor: ACTOR,
      provider: "ahachat",
    })
  })

  test("declares listing errors", () => {
    expect(procedure.errors).toBe(errorHelper.possibleErrorsOnListingResource)
  })
})

describe("GET /v1/contact-syncs/sources/{inboxId}/schema", () => {
  const procedure = find("GET", "/v1/contact-syncs/sources/{inboxId}/schema")

  test("returns only tags and fields for the token workspace", async () => {
    service.getSchema.mockResolvedValueOnce({
      tags: [{ id: "t1" }],
      fields: [{ id: "f1" }],
      extra: "dropped",
    })

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { inboxId: "c1", workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ tags: [{ id: "t1" }], fields: [{ id: "f1" }] })

    expect(service.getSchema).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actor: ACTOR,
      inboxId: "c1",
    })
  })

  test("declares source-not-found (404) and not-eligible (422)", () => {
    expect(procedure.errors).toBe(
      errorHelper.possibleErrorsOnReadingContactSyncSource,
    )
    expect(procedure.errors?.contactSyncSourceNotFound?.status).toBe(404)
    expect(procedure.errors?.contactSyncSourceNotEligible?.status).toBe(422)
  })
})

describe("PUT /v1/contact-syncs/sources/{inboxId}/mappings", () => {
  const procedure = find("PUT", "/v1/contact-syncs/sources/{inboxId}/mappings")

  test("is a 204 that forwards the mappings to the token workspace", async () => {
    service.saveMappings.mockResolvedValueOnce(undefined)
    const tags = [
      { externalId: "a", target: { tagId: "10" } },
      { externalId: "b", target: { tagName: "VIP" } },
      { externalId: "c", target: null },
    ]
    const fields = [
      { externalId: "x", target: { customFieldId: "20" } },
      {
        externalId: "y",
        target: { customFieldName: "City", customFieldType: "shortText" },
      },
    ]

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { inboxId: "c1", tags, fields, workspaceId: "attacker" },
      }),
    ).resolves.toBeUndefined()

    expect(procedure.route.successStatus).toBe(204)
    expect(service.saveMappings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actor: ACTOR,
      inboxId: "c1",
      tags,
      fields,
    })
  })

  test("declares the 422 mapping-invalid error", () => {
    expect(procedure.errors).toBe(errorHelper.possibleErrorsOnContactSyncSource)
    expect(procedure.errors?.contactSyncMappingInvalid?.status).toBe(422)
  })

  test("the request schema accepts tag by id or name and field by id or name+type", () => {
    const parsed = schema.saveContactSyncMappingsPublicRequest.safeParse({
      inboxId: "1",
      tags: [
        { externalId: "a", target: { tagId: "10" } },
        { externalId: "b", target: { tagName: "VIP" } },
      ],
      fields: [
        { externalId: "x", target: { customFieldId: "20" } },
        {
          externalId: "y",
          target: { customFieldName: "City", customFieldType: "shortText" },
        },
      ],
    })
    expect(parsed.error?.issues).toBeUndefined()
    expect(parsed.success).toBe(true)
  })

  test("the request schema rejects a field name without a type and an empty tag name", () => {
    const noType = schema.saveContactSyncMappingsPublicRequest.safeParse({
      inboxId: "1",
      fields: [{ externalId: "y", target: { customFieldName: "City" } }],
    })
    const emptyName = schema.saveContactSyncMappingsPublicRequest.safeParse({
      inboxId: "1",
      tags: [{ externalId: "a", target: { tagName: "" } }],
    })
    expect(noType.success).toBe(false)
    expect(emptyName.success).toBe(false)
  })
})

describe("GET /v1/contact-syncs/availability", () => {
  const procedure = find("GET", "/v1/contact-syncs/availability")

  test("returns the availability of the token workspace", async () => {
    const availability = {
      canSync: false,
      blockedReason: "cooldown",
      nextSyncAt: new Date("2030-01-01T00:00:00Z"),
      activeRunId: null,
    }
    service.getAvailability.mockResolvedValueOnce(availability)

    await expect(
      procedure.handler?.({ context: ctx, input: {} }),
    ).resolves.toEqual(availability)

    expect(service.getAvailability).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })
})

describe("POST /v1/contact-syncs", () => {
  const procedure = find("POST", "/v1/contact-syncs")

  test("schedules for the token workspace as the token's actor and returns the run id", async () => {
    service.schedule.mockResolvedValueOnce({ id: "run-1", other: "dropped" })
    const sources = [{ inboxId: "i1" }, { inboxId: "i2" }]

    await expect(
      procedure.handler?.({
        context: ctx,
        input: {
          sources,
          syncTags: true,
          syncCustomFields: false,
          overwriteExisting: true,
          workspaceId: "attacker",
        },
      }),
    ).resolves.toEqual({ runId: "run-1" })

    expect(procedure.route.successStatus).toBe(202)
    expect(service.schedule).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actor: ACTOR,
      triggerSource: "api",
      sources,
      syncTags: true,
      syncCustomFields: false,
      overwriteExisting: true,
    })
  })

  test("the request schema defaults tags/fields on and overwrite off", () => {
    const parsed = schema.createContactSyncPublicRequest.parse({
      sources: [{ inboxId: "1" }],
    })
    expect(parsed).toMatchObject({
      syncTags: true,
      syncCustomFields: true,
      overwriteExisting: false,
    })
  })

  test("the request schema rejects an empty source list", () => {
    expect(
      schema.createContactSyncPublicRequest.safeParse({ sources: [] }).success,
    ).toBe(false)
  })

  test("propagates a service error", async () => {
    service.schedule.mockRejectedValueOnce(new Error("already running"))

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { sources: [{ inboxId: "c1" }] },
      }),
    ).rejects.toThrow("already running")
  })

  test.each([
    ["contactSyncAlreadyRunning", 409],
    ["contactSyncCooldown", 409],
    ["contactSyncNoSources", 422],
    ["contactSyncTooManySources", 422],
    ["contactSyncDuplicateSource", 422],
    ["contactSyncNotConfigured", 503],
    ["contactSyncSourceUnavailable", 503],
    ["contactSyncSourceNotFound", 404],
    ["contactSyncSourceNotEligible", 422],
  ])("declares %s with HTTP %i", (code, status) => {
    expect(procedure.errors).toBe(
      errorHelper.possibleErrorsOnSchedulingContactSync,
    )
    expect(procedure.errors?.[code]?.status).toBe(status)
  })
})

describe("POST /v1/contact-syncs/connect-import", () => {
  const procedure = find("POST", "/v1/contact-syncs/connect-import")
  const pages = [{ inboxId: "i1", aiReadsSyncedHistory: true }]

  test("starts the contacts-first import for the token workspace as the token's actor", async () => {
    const outcome = { runId: "run-1", pages: [] }
    service.scheduleConnectImport.mockResolvedValueOnce(outcome)

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { pages, workspaceId: "attacker" },
      }),
    ).resolves.toBe(outcome)

    expect(procedure.route.successStatus).toBe(202)
    expect(service.scheduleConnectImport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actor: ACTOR,
      triggerSource: "api",
      pages,
    })
  })

  test("a token without the channels scope is refused: the import also turns on history syncs", async () => {
    await expect(
      procedure.handler?.({
        context: { ...ctx, apiToken: { id: "tok-1", scopes: ["contacts"] } },
        input: { pages },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(service.scheduleConnectImport).not.toHaveBeenCalled()
  })

  test("a token with contacts and channels, or an unrestricted one, is allowed", async () => {
    service.scheduleConnectImport.mockResolvedValue({ runId: null, pages: [] })

    for (const scopes of [["contacts", "channels"], null]) {
      await procedure.handler?.({
        context: { ...ctx, apiToken: { id: "tok-1", scopes } },
        input: { pages },
      })
    }

    expect(service.scheduleConnectImport).toHaveBeenCalledTimes(2)
  })

  test("the request defaults the AI choice off and bounds the page list", () => {
    expect(
      schema.startContactImportRequest.parse({ pages: [{ inboxId: "1" }] })
        .pages[0],
    ).toMatchObject({ aiReadsSyncedHistory: false })
    expect(
      schema.startContactImportRequest.safeParse({ pages: [] }).success,
    ).toBe(false)
  })

  test("declares only what it can throw: a missing configuration and the idempotency errors", () => {
    expect(procedure.errors).toBe(
      errorHelper.possibleErrorsOnConnectingContactSyncImport,
    )
    expect(procedure.errors?.contactSyncNotConfigured?.status).toBe(503)
    expect(procedure.errors?.contactSyncCooldown).toBeUndefined()
  })
})

describe("POST /v1/contact-syncs/sources/{inboxId}/retry-history", () => {
  const procedure = find(
    "POST",
    "/v1/contact-syncs/sources/{inboxId}/retry-history",
  )

  test("re-opens the owed history sync of a page of the token workspace", async () => {
    service.retryHistory.mockResolvedValueOnce({ reopened: true })

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { inboxId: "i1", workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ reopened: true })

    expect(service.retryHistory).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      inboxId: "i1",
    })
  })

  test("a token without the channels scope is refused: it turns on a history sync", async () => {
    await expect(
      procedure.handler?.({
        context: { ...ctx, apiToken: { id: "tok-1", scopes: ["contacts"] } },
        input: { inboxId: "i1" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(service.retryHistory).not.toHaveBeenCalled()
  })

  test("declares the idempotency errors of a write", () => {
    expect(procedure.errors).toBe(
      errorHelper.possibleErrorsOnRetryingContactSyncHistory,
    )
  })
})

describe("GET /v1/contact-syncs", () => {
  const procedure = find("GET", "/v1/contact-syncs")

  test("passes only workspaceId/page/perPage to listHistory", async () => {
    service.listHistory.mockResolvedValueOnce({
      data: [{ id: "r1" }],
      pageCount: 3,
      total: 99,
    })

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { page: 2, perPage: 25, workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ data: [{ id: "r1" }], pageCount: 3 })

    expect(service.listHistory).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
    })
  })
})

describe("GET /v1/contact-syncs/{runId}", () => {
  const procedure = find("GET", "/v1/contact-syncs/{runId}")

  test("gets the run inside the token workspace", async () => {
    service.get.mockResolvedValueOnce({ id: "r1" })

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { runId: "r1", workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ id: "r1" })

    expect(service.get).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      runId: "r1",
    })
  })

  test("declares run-not-found as 404", () => {
    expect(procedure.errors).toBe(
      errorHelper.possibleErrorsOnReadingContactSyncRun,
    )
    expect(procedure.errors?.contactSyncRunNotFound?.status).toBe(404)
  })
})

describe("POST /v1/contact-syncs/{runId}/cancel", () => {
  const procedure = find("POST", "/v1/contact-syncs/{runId}/cancel")

  test("cancels the run of the token workspace", async () => {
    service.cancel.mockResolvedValueOnce({ cancelled: true })

    await expect(
      procedure.handler?.({
        context: ctx,
        input: { runId: "r1", workspaceId: "attacker" },
      }),
    ).resolves.toEqual({ cancelled: true })

    expect(service.cancel).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      runId: "r1",
    })
  })

  test("reports cancelled:false (not an error) for a finished run", async () => {
    service.cancel.mockResolvedValueOnce({ cancelled: false })

    await expect(
      procedure.handler?.({ context: ctx, input: { runId: "r1" } }),
    ).resolves.toEqual({ cancelled: false })
  })

  test("declares run-not-found as 404", () => {
    expect(procedure.errors).toBe(errorHelper.possibleErrorsOnContactSyncRun)
    expect(procedure.errors?.contactSyncRunNotFound?.status).toBe(404)
  })
})
