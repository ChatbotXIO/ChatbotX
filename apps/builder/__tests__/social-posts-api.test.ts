// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>
type Captured = {
  handler?: Handler
  method: string
  path: string
  use: { middleware: unknown }[]
}

const {
  assertNotBlocked,
  authorizedGate,
  captured,
  creatorIssues,
  permissionGate,
  publishService,
  recurrenceService,
  removeService,
  scheduleService,
  service,
} = vi.hoisted(() => {
  const captured: Captured[] = []
  return {
    assertNotBlocked: vi.fn(),
    authorizedGate: { kind: "authorized" },
    captured,
    creatorIssues: vi.fn(),
    permissionGate: (key: string) => ({ key, kind: "permission" }),
    recurrenceService: {
      assertNotTemplate: vi.fn(),
      end: vi.fn(),
      listOccurrences: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setExcluded: vi.fn(),
      setRule: vi.fn(),
      setRuleInTx: vi.fn(),
    },
    scheduleService: {
      prepare: vi.fn(),
      reschedule: vi.fn(),
      schedule: vi.fn(),
    },
    removeService: { request: vi.fn() },
    publishService: {
      publishNow: vi.fn(),
      resolveTarget: vi.fn(),
      retryTarget: vi.fn(),
      storedIssues: vi.fn(),
    },
    service: {
      contentTypes: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      preview: vi.fn(),
      update: vi.fn(),
      validate: vi.fn(),
    },
  }
})

vi.mock("@chatbotx.io/business", () => ({
  assertSchedulePlan: vi.fn(),
  emitSocialPostChanged: vi.fn(),
  messageUsageService: { assertRoom: vi.fn().mockResolvedValue(undefined) },
  publishDestinationService: {
    resolveRefs: async (input: {
      refs: { destinationId?: string; inboxId?: string }[]
    }) =>
      input.refs.map((ref) => ref.destinationId ?? `dest-of-${ref.inboxId}`),
  },
  socialPostScheduleService: scheduleService,
  socialPostIssuesException: (issues: unknown[]) =>
    new Error(`invalid:${issues.length}`),
  socialPostPublishService: publishService,
  socialPostRecurrenceService: recurrenceService,
  socialPostRemoveService: removeService,
  socialPostService: service,
}))
vi.mock("@chatbotx.io/business/social-post/creator-settings", () => ({
  creatorSettingsIssues: creatorIssues,
}))
vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: assertNotBlocked,
}))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: authorizedGate,
  workspacePermissionMiddleware: permissionGate,
}))
vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnChangingSocialPost: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
}))
vi.mock("@/orpc", () => {
  const makeProcedure = (config: { method: string; path: string }) => {
    const uses: { middleware: unknown }[] = []
    const entry: Captured = {
      method: config.method,
      path: config.path,
      use: uses,
    }
    const chain = {
      errors: vi.fn(() => chain),
      handler: vi.fn((handler: Handler) => {
        entry.handler = handler
        return { handler }
      }),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      use: vi.fn((middleware: unknown) => {
        uses.push({ middleware })
        return chain
      }),
    }
    captured.push(entry)
    return chain
  }
  return {
    authorizedAPI: {
      route: (config: { method: string; path: string }) =>
        makeProcedure(config),
    },
    workspaceTokenAuthAPIForScope: () => ({
      route: (config: { method: string; path: string }) =>
        makeProcedure(config),
    }),
  }
})

const { socialPostsAPIs } = await import("@/features/social-posts/api/private")
const { socialPostsPublicRouter } = await import(
  "@/features/social-posts/api/public"
)

const isRoutePath = (path: string): path is `/${string}` => path.startsWith("/")

const workspace = { id: "ws-1", ownerId: "owner-1" }
const privateProcedures = captured.slice(0, Object.keys(socialPostsAPIs).length)
const publicProcedures = captured.slice(privateProcedures.length)
const handlerOf = (
  procedures: Captured[],
  method: string,
  path: string,
): Handler => {
  const found = procedures.find(
    (entry) => entry.method === method && entry.path === path,
  )
  if (!found?.handler) {
    throw new Error(`no handler for ${method} ${path}`)
  }
  return found.handler
}

describe("the composed post procedures", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    creatorIssues.mockResolvedValue([])
  })

  test("every session procedure checks the workspace, then the broadcast permission", () => {
    expect(privateProcedures).toHaveLength(19)
    for (const procedure of privateProcedures) {
      expect(procedure.use.map(({ middleware }) => middleware)).toEqual([
        authorizedGate,
        { key: "broadcast", kind: "permission" },
      ])
    }
  })

  test("the public static paths come before the id routes", () => {
    const paths = publicProcedures.map(
      (entry) => `${entry.method} ${entry.path}`,
    )

    for (const staticPath of [
      "POST /v1/posts/validate",
      "POST /v1/posts/preview",
      "GET /v1/posts/content-types",
      "GET /v1/posts/counts",
    ]) {
      expect(paths.indexOf(staticPath)).toBeGreaterThanOrEqual(0)
      expect(paths.indexOf(staticPath)).toBeLessThan(
        paths.indexOf("GET /v1/posts/{id}"),
      )
    }
  })

  test.each([
    ["public", "/v1/posts", "/v1/posts"],
    [
      "private",
      "/workspaces/{workspaceId}/social-posts",
      "/workspaces/ws-1/social-posts",
    ],
  ])("%s: `content-types` is dispatched as the static route, never as an id", async (kind, base, requested) => {
    const [{ os }, { OpenAPIHandler }] = await Promise.all([
      import("@orpc/server"),
      import("@orpc/openapi/fetch"),
    ])
    const procedures = kind === "public" ? publicProcedures : privateProcedures
    const hits: string[] = []
    const router: Record<string, unknown> = {}
    for (const [index, entry] of procedures.entries()) {
      if (
        !(
          isRoutePath(entry.path) &&
          entry.path.startsWith(base) &&
          entry.method === "GET"
        )
      ) {
        continue
      }
      router[`p${index}`] = os
        .route({ method: "GET", path: entry.path })
        .handler(() => {
          hits.push(entry.path)
          return {}
        })
    }
    const handler = new OpenAPIHandler(router as never)

    await handler.handle(
      new Request(`http://localhost${requested}/content-types`),
      {
        context: {},
        prefix: undefined,
      },
    )
    await handler.handle(new Request(`http://localhost${requested}/abc`), {
      context: {},
      prefix: undefined,
    })

    expect(hits).toEqual([`${base}/content-types`, `${base}/{id}`])
  })

  test("the public router has the procedures the CLI and MCP expose", () => {
    expect(Object.keys(socialPostsPublicRouter)).toEqual([
      "create",
      "list",
      "counts",
      "validate",
      "preview",
      "contentTypes",
      "get",
      "getMetrics",
      "update",
      "delete",
      "duplicate",
      "publish",
      "reschedule",
      "unschedule",
      "retryTarget",
      "resolveTarget",
      "setRecurrence",
      "endRecurrence",
      "pauseRecurrence",
      "resumeRecurrence",
      "listOccurrences",
      "skipOccurrences",
      "restoreOccurrences",
    ])
  })

  describe("scheduling", () => {
    const at = "2026-12-01T09:00:00+07:00"

    test("create with scheduledAt stores and schedules the post in one write, with a per-target time and the zone", async () => {
      const hook = vi.fn()
      service.validate.mockResolvedValue({ issues: [], valid: true })
      scheduleService.prepare.mockResolvedValue(hook)
      service.create.mockResolvedValue({ id: "p1", status: "scheduled" })

      const result = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: {
          scheduledAt: at,
          targets: [
            { destinationId: "d1" },
            { destinationId: "d2", scheduledAt: "2026-12-02T10:00:00Z" },
          ],
          timezone: "Asia/Ho_Chi_Minh",
        },
      })

      expect(result).toEqual({ id: "p1", status: "scheduled" })
      expect(scheduleService.prepare).toHaveBeenCalledWith({
        plan: {
          queue: undefined,
          scheduledAt: new Date(at),
          targetTimes: { d2: new Date("2026-12-02T10:00:00Z") },
          timezone: "Asia/Ho_Chi_Minh",
        },
        workspaceId: "ws-1",
      })
      // The stored content carries no schedule fields; the hook rides the write.
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          afterWrite: hook,
          targets: [{ destinationId: "d1" }, { destinationId: "d2" }],
        }),
      )
      expect(scheduleService.schedule).not.toHaveBeenCalled()
    })

    test("a replayed create that finds a plain draft schedules it", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      scheduleService.prepare.mockResolvedValue(vi.fn())
      service.create.mockResolvedValue({ id: "p1", status: "draft" })
      scheduleService.schedule.mockResolvedValue({
        id: "p1",
        status: "scheduled",
      })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: { publish: "queue", targets: [{ destinationId: "d1" }] },
      })

      expect(scheduleService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "p1",
          plan: expect.objectContaining({ queue: "next" }),
        }),
      )
    })

    test("a replayed create that finds a plain draft publishes it with publish now", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      service.create.mockResolvedValue({ id: "p1", status: "draft" })
      publishService.publishNow.mockResolvedValue({
        id: "p1",
        status: "publishing",
      })

      const result = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: { publish: "now", targets: [{ destinationId: "d1" }] },
      })

      expect(result).toEqual({ id: "p1", status: "publishing" })
      expect(publishService.publishNow).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: "ws-1",
      })
      expect(service.create).toHaveBeenCalledTimes(1)
    })

    test("the create does not put the schedule in the idempotency input", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      scheduleService.prepare.mockResolvedValue(vi.fn())
      service.create.mockResolvedValue({ id: "p1", status: "scheduled" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: {
          scheduledAt: at,
          targets: [{ destinationId: "d1" }],
        },
      })

      expect(service.create.mock.calls[0]?.[0]).not.toHaveProperty("intent")
    })

    test("update with a time saves and schedules in one write", async () => {
      const hook = vi.fn()
      scheduleService.prepare.mockResolvedValue(hook)
      service.get.mockResolvedValue({ id: "p1", targets: [] })
      service.update.mockResolvedValue({ id: "p1", status: "scheduled" })

      await handlerOf(
        publicProcedures,
        "PATCH",
        "/v1/posts/{id}",
      )({
        context: { workspace },
        input: { id: "p1", queue: "top", text: "x" },
      })

      expect(service.update).toHaveBeenCalledWith(
        expect.objectContaining({ afterWrite: hook, id: "p1" }),
      )
      expect(scheduleService.schedule).not.toHaveBeenCalled()
    })

    test("a time cannot be combined with publish now or a draft", async () => {
      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts",
        )({
          context: { workspace },
          input: {
            publish: "now",
            scheduledAt: at,
            targets: [{ destinationId: "d1" }],
          },
        }),
      ).rejects.toThrow("cannot be combined")
      expect(service.create).not.toHaveBeenCalled()
    })

    test.each([
      ["a time", { scheduledAt: at }],
      ["a queue", { queue: "top" }],
      ["a time zone alone", { timezone: "UTC" }],
    ])("reschedule with %s is refused in a blocked workspace", async (_n, body) => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/reschedule",
        )({ context: { workspace }, input: { id: "p1", ...body } }),
      ).rejects.toThrow("blocked")
      expect(scheduleService.reschedule).not.toHaveBeenCalled()
    })

    test("unscheduling stays allowed in a blocked workspace", async () => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))
      scheduleService.reschedule.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/reschedule",
      )({
        context: { workspace },
        input: { id: "p1", targetId: "t1", unschedule: true },
      })

      expect(assertNotBlocked).not.toHaveBeenCalled()
      expect(scheduleService.reschedule).toHaveBeenCalledWith({
        change: { kind: "unschedule" },
        id: "p1",
        targetId: "t1",
        workspaceId: "ws-1",
      })
    })

    test("the unschedule route takes the post back to a draft with no block check", async () => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))
      scheduleService.reschedule.mockResolvedValue({ id: "p1" })
      service.get.mockResolvedValue({ id: "p1", status: "scheduled" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/unschedule",
      )({ context: { workspace }, input: { id: "p1", targetId: "t1" } })

      expect(assertNotBlocked).not.toHaveBeenCalled()
      expect(scheduleService.reschedule).toHaveBeenCalledWith({
        change: { kind: "unschedule" },
        id: "p1",
        targetId: "t1",
        workspaceId: "ws-1",
      })
    })

    test("repeating unschedule on a draft returns it without touching the schedule", async () => {
      service.get.mockResolvedValue({ id: "p1", status: "draft" })

      const out = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/unschedule",
      )({ context: { workspace }, input: { id: "p1" } })

      expect(out).toEqual({ id: "p1", status: "draft" })
      expect(scheduleService.reschedule).not.toHaveBeenCalled()
    })

    test("reschedule takes exactly one change", async () => {
      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/reschedule",
        )({
          context: { workspace },
          input: { id: "p1", queue: "next", scheduledAt: at },
        }),
      ).rejects.toThrow("one of scheduledAt, queue or unschedule")
      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/reschedule",
        )({ context: { workspace }, input: { id: "p1" } }),
      ).rejects.toThrow("Give scheduledAt, queue, timezone or unschedule")
    })
  })

  describe("create", () => {
    test("a token creates a post as the API, in the token's workspace, after the block check", async () => {
      service.create.mockResolvedValue({ id: "p1" })

      const result = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: {
          publish: "draft",
          targets: [{ destinationId: "d1" }],
          text: "hi",
        },
      })

      expect(result).toEqual({ id: "p1" })
      expect(assertNotBlocked).toHaveBeenCalledWith("owner-1")
      expect(service.create).toHaveBeenCalledWith({
        createdById: null,
        createdVia: "api",
        targets: [{ destinationId: "d1" }],
        text: "hi",
        workspaceId: "ws-1",
      })
    })

    test("a blocked workspace is refused before anything is written", async () => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts",
        )({
          context: { workspace },
          input: { publish: "draft", targets: [{ destinationId: "d1" }] },
        }),
      ).rejects.toThrow("blocked")
      expect(service.create).not.toHaveBeenCalled()
    })

    test("a member's session records who composed the post and drops the workspace id from the body", async () => {
      service.create.mockResolvedValue({ id: "p2" })

      await handlerOf(
        privateProcedures,
        "POST",
        "/workspaces/{workspaceId}/social-posts",
      )({
        context: { user: { id: "user-1" }, workspace },
        input: {
          publish: "draft",
          targets: [{ destinationId: "d1" }],
          workspaceId: "ws-1",
        },
      })

      expect(service.create).toHaveBeenCalledWith({
        createdById: "user-1",
        createdVia: "ui",
        targets: [{ destinationId: "d1" }],
        workspaceId: "ws-1",
      })
    })
  })

  describe("publishing", () => {
    test("create with `publish: now` validates first, then saves and publishes", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      service.create.mockResolvedValue({ id: "p1", status: "draft" })
      publishService.publishNow.mockResolvedValue({
        id: "p1",
        status: "publishing",
      })

      const result = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: { publish: "now", targets: [{ destinationId: "d1" }] },
      })

      expect(result).toEqual({ id: "p1", status: "publishing" })
      expect(publishService.publishNow).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: "ws-1",
      })
    })

    test("a post with issues is refused whole and nothing is saved", async () => {
      service.validate.mockResolvedValue({
        issues: [{ targetIndex: 0 }, { targetIndex: 1 }],
        valid: false,
      })

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts",
        )({
          context: { workspace },
          input: { publish: "now", targets: [{ destinationId: "d1" }] },
        }),
      ).rejects.toThrow("invalid:2")
      expect(service.create).not.toHaveBeenCalled()
    })

    test("a repeated idempotent create does not publish a second time", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      service.create.mockResolvedValue({ id: "p1", status: "publishing" })

      const result = await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: { publish: "now", targets: [{ destinationId: "d1" }] },
      })

      expect(result).toEqual({ id: "p1", status: "publishing" })
      expect(publishService.publishNow).not.toHaveBeenCalled()
    })

    test("update with a time or `publish: now` refuses stale creator settings before saving", async () => {
      service.get.mockResolvedValue({
        id: "p1",
        targets: [
          { destination: { id: "d1" }, options: { privacyLevel: "old" } },
        ],
      })
      creatorIssues.mockResolvedValue([{ targetIndex: 0 }])

      await expect(
        handlerOf(
          publicProcedures,
          "PATCH",
          "/v1/posts/{id}",
        )({
          context: { workspace },
          input: { id: "p1", publish: "now", text: "x" },
        }),
      ).rejects.toThrow("invalid:1")
      expect(creatorIssues).toHaveBeenCalledWith("ws-1", [
        { destinationId: "d1", options: { privacyLevel: "old" } },
      ])
      expect(service.update).not.toHaveBeenCalled()
      expect(publishService.publishNow).not.toHaveBeenCalled()
    })

    test("update checks the new destinations, not the stored ones, when it replaces them", async () => {
      service.update.mockResolvedValue({ id: "p1" })
      publishService.publishNow.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "PATCH",
        "/v1/posts/{id}",
      )({
        context: { workspace },
        input: {
          id: "p1",
          publish: "now",
          targets: [{ destinationId: "d2", options: { privacyLevel: "ok" } }],
        },
      })

      expect(service.get).not.toHaveBeenCalled()
      expect(creatorIssues).toHaveBeenCalledWith("ws-1", [
        { destinationId: "d2", options: { privacyLevel: "ok" } },
      ])
    })

    test("a plain save of a draft skips the creator-settings preflight", async () => {
      service.update.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "PATCH",
        "/v1/posts/{id}",
      )({ context: { workspace }, input: { id: "p1", text: "x" } })

      expect(creatorIssues).not.toHaveBeenCalled()
    })

    test("publish refuses stale creator settings before queueing", async () => {
      service.get.mockResolvedValue({
        id: "p1",
        targets: [
          { destination: { id: "d1" }, options: { privacyLevel: "old" } },
        ],
      })
      creatorIssues.mockResolvedValue([{ targetIndex: 0 }])

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/publish",
        )({ context: { workspace }, input: { id: "p1" } }),
      ).rejects.toThrow("invalid:1")
      expect(publishService.publishNow).not.toHaveBeenCalled()
    })

    test("update with `publish: now` publishes the saved post", async () => {
      service.get.mockResolvedValue({ id: "p1", targets: [] })
      service.update.mockResolvedValue({ id: "p1" })
      publishService.publishNow.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "PATCH",
        "/v1/posts/{id}",
      )({
        context: { workspace },
        input: { id: "p1", publish: "now", text: "x" },
      })

      expect(service.update).toHaveBeenCalledWith({
        id: "p1",
        text: "x",
        workspaceId: "ws-1",
      })
      expect(publishService.publishNow).toHaveBeenCalledTimes(1)
    })

    test.each([
      ["publish", "/v1/posts/{id}/publish", { id: "p1" }],
      [
        "retry",
        "/v1/posts/{id}/targets/{targetId}/retry",
        { id: "p1", targetId: "t1" },
      ],
      [
        "resolve",
        "/v1/posts/{id}/targets/{targetId}/resolve",
        { id: "p1", outcome: "published", targetId: "t1" },
      ],
    ])("%s is refused in a blocked workspace", async (_name, path, input) => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          path,
        )({ context: { workspace }, input }),
      ).rejects.toThrow("blocked")
      expect(publishService.publishNow).not.toHaveBeenCalled()
      expect(publishService.retryTarget).not.toHaveBeenCalled()
      expect(publishService.resolveTarget).not.toHaveBeenCalled()
    })

    test("retry and resolve act in the caller's workspace", async () => {
      publishService.retryTarget.mockResolvedValue({ id: "p1" })
      publishService.resolveTarget.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/targets/{targetId}/retry",
      )({ context: { workspace }, input: { id: "p1", targetId: "t1" } })
      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/targets/{targetId}/resolve",
      )({
        context: { workspace },
        input: { id: "p1", outcome: "retry", targetId: "t1" },
      })

      expect(publishService.retryTarget).toHaveBeenCalledWith({
        id: "p1",
        targetId: "t1",
        workspaceId: "ws-1",
      })
      expect(publishService.resolveTarget).toHaveBeenCalledWith({
        id: "p1",
        outcome: "retry",
        targetId: "t1",
        workspaceId: "ws-1",
      })
    })
  })

  describe("parts and first comment", () => {
    test("retry and resolve pass the optional part id through", async () => {
      publishService.retryTarget.mockResolvedValue({ id: "p1" })
      publishService.resolveTarget.mockResolvedValue({ id: "p1" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/targets/{targetId}/retry",
      )({
        context: { workspace },
        input: { id: "p1", partId: "pt1", targetId: "t1" },
      })
      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/targets/{targetId}/resolve",
      )({
        context: { workspace },
        input: {
          id: "p1",
          outcome: "published",
          partId: "pt1",
          targetId: "t1",
        },
      })

      expect(publishService.retryTarget).toHaveBeenCalledWith({
        id: "p1",
        partId: "pt1",
        targetId: "t1",
        workspaceId: "ws-1",
      })
      expect(publishService.resolveTarget).toHaveBeenCalledWith({
        id: "p1",
        outcome: "published",
        partId: "pt1",
        targetId: "t1",
        workspaceId: "ws-1",
      })
    })

    test("retrying a part is refused in a blocked workspace before the service is called", async () => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/targets/{targetId}/retry",
        )({
          context: { workspace },
          input: { id: "p1", partId: "pt1", targetId: "t1" },
        }),
      ).rejects.toThrow("blocked")
      expect(publishService.retryTarget).not.toHaveBeenCalled()
    })
  })

  describe("trial-expired rules", () => {
    test.each([
      ["update", "PATCH", "/v1/posts/{id}", { id: "p1", text: "x" }],
      ["duplicate", "POST", "/v1/posts/{id}/duplicate", { id: "p1" }],
    ])("%s is refused in a blocked workspace", async (_name, method, path, input) => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          method,
          path,
        )({ context: { workspace }, input }),
      ).rejects.toThrow("blocked")
      expect(service.update).not.toHaveBeenCalled()
      expect(service.duplicate).not.toHaveBeenCalled()
    })

    const rule = {
      end: { kind: "never" },
      frequency: "daily",
      interval: 1,
      startsOn: "2026-12-01",
      timeOfDay: "09:00",
      timezone: "UTC",
    }

    test.each([
      ["set the rule", "PUT", "/v1/posts/{id}/recurrence", { id: "p1", rule }],
      ["resume", "POST", "/v1/posts/{id}/recurrence/resume", { id: "p1" }],
      [
        "skip a date",
        "POST",
        "/v1/posts/{id}/recurrence/occurrences/skip",
        { dates: ["2026-12-25"], id: "p1" },
      ],
      [
        "restore a date",
        "POST",
        "/v1/posts/{id}/recurrence/occurrences/restore",
        { dates: ["2026-12-25"], id: "p1" },
      ],
    ])("%s is refused in a blocked workspace", async (_name, method, path, input) => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))

      await expect(
        handlerOf(
          publicProcedures,
          method,
          path,
        )({ context: { workspace }, input }),
      ).rejects.toThrow("blocked")
      expect(recurrenceService.setRule).not.toHaveBeenCalled()
      expect(recurrenceService.resume).not.toHaveBeenCalled()
      expect(recurrenceService.setExcluded).not.toHaveBeenCalled()
    })

    test("pausing and ending a series stay open when the workspace is blocked", async () => {
      assertNotBlocked.mockRejectedValue(new Error("blocked"))
      recurrenceService.pause.mockResolvedValue({ state: "paused" })
      recurrenceService.end.mockResolvedValue({ state: "ended" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/{id}/recurrence/pause",
      )({ context: { workspace }, input: { id: "p1" } })
      await handlerOf(
        publicProcedures,
        "DELETE",
        "/v1/posts/{id}/recurrence",
      )({ context: { workspace }, input: { id: "p1" } })

      expect(recurrenceService.pause).toHaveBeenCalledWith({
        socialPostId: "p1",
        workspaceId: "ws-1",
      })
      expect(recurrenceService.end).toHaveBeenCalledTimes(1)
      expect(assertNotBlocked).not.toHaveBeenCalled()
    })

    test("the session skip, restore and list of series runs call the same operations as the public ones", async () => {
      recurrenceService.setExcluded.mockResolvedValue({ state: "active" })
      recurrenceService.listOccurrences.mockResolvedValue({ items: [] })
      const input = { dates: ["2026-12-25"], id: "p1", workspaceId: "ws-1" }
      const base = "/workspaces/{workspaceId}/social-posts/{id}/recurrence"

      await handlerOf(
        privateProcedures,
        "POST",
        `${base}/occurrences/skip`,
      )({ context: { workspace }, input })
      await handlerOf(
        privateProcedures,
        "POST",
        `${base}/occurrences/restore`,
      )({ context: { workspace }, input })
      await handlerOf(
        privateProcedures,
        "GET",
        `${base}/occurrences`,
      )({
        context: { workspace },
        input: { id: "p1", limit: 20, workspaceId: "ws-1" },
      })

      expect(recurrenceService.setExcluded).toHaveBeenNthCalledWith(1, {
        dates: ["2026-12-25"],
        excluded: true,
        socialPostId: "p1",
        workspaceId: "ws-1",
      })
      expect(recurrenceService.setExcluded).toHaveBeenNthCalledWith(2, {
        dates: ["2026-12-25"],
        excluded: false,
        socialPostId: "p1",
        workspaceId: "ws-1",
      })
      expect(recurrenceService.listOccurrences).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        socialPostId: "p1",
        workspaceId: "ws-1",
      })
    })

    test("a repeat rule on create cannot be combined with a time, publish now or a queue", async () => {
      for (const extra of [
        { publish: "now" },
        { queue: "next" },
        { scheduledAt: "2027-01-01T09:00:00Z" },
      ]) {
        await expect(
          handlerOf(
            publicProcedures,
            "POST",
            "/v1/posts",
          )({
            context: { workspace },
            input: {
              recurrence: rule,
              targets: [{ destinationId: "d1" }],
              ...extra,
            },
          }),
        ).rejects.toThrow()
      }
      expect(service.create).not.toHaveBeenCalled()
    })

    test("a repeat rule on create is stored in the transaction that stores the post", async () => {
      service.validate.mockResolvedValue({ issues: [], valid: true })
      service.create.mockResolvedValue({ id: "p1", status: "draft" })

      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts",
      )({
        context: { workspace },
        input: { recurrence: rule, targets: [{ destinationId: "d1" }] },
      })

      const { afterWrite } = service.create.mock.calls[0][0]
      await afterWrite("tx", "p1")
      expect(recurrenceService.setRuleInTx).toHaveBeenCalledWith("tx", {
        rule,
        socialPostId: "p1",
        workspaceId: "ws-1",
      })
    })

    describe("setting a repeat rule on a stored draft", () => {
      const input = { id: "p1", rule }
      const call = async () =>
        await handlerOf(
          publicProcedures,
          "PUT",
          "/v1/posts/{id}/recurrence",
        )({ context: { workspace }, input })

      beforeEach(() => {
        service.get.mockResolvedValue({
          id: "p1",
          targets: [
            { destination: { id: "d1" }, options: { privacyLevel: "x" } },
          ],
        })
        publishService.storedIssues.mockResolvedValue([])
        creatorIssues.mockResolvedValue([])
        recurrenceService.setRule.mockResolvedValue({ state: "active" })
      })

      test("stores the rule when the stored content and creator settings are valid", async () => {
        await call()

        expect(creatorIssues).toHaveBeenCalledWith("ws-1", [
          { destinationId: "d1", options: { privacyLevel: "x" } },
        ])
        expect(recurrenceService.setRule).toHaveBeenCalledTimes(1)
      })

      test("refuses a draft whose stored content publishing would refuse", async () => {
        publishService.storedIssues.mockResolvedValue([{ targetIndex: 0 }])

        await expect(call()).rejects.toThrow("invalid:1")
        expect(recurrenceService.setRule).not.toHaveBeenCalled()
      })

      test("refuses a draft whose TikTok creator settings are invalid", async () => {
        creatorIssues.mockResolvedValue([{ targetIndex: 0 }])

        await expect(call()).rejects.toThrow("invalid:1")
        expect(recurrenceService.setRule).not.toHaveBeenCalled()
      })
    })

    test("a template is refused when someone publishes it", async () => {
      recurrenceService.assertNotTemplate.mockRejectedValue(
        new Error("template"),
      )

      await expect(
        handlerOf(
          publicProcedures,
          "POST",
          "/v1/posts/{id}/publish",
        )({ context: { workspace }, input: { id: "p1" } }),
      ).rejects.toThrow("template")
      expect(publishService.publishNow).not.toHaveBeenCalled()
    })

    test("reads and deleting a draft never check the block", async () => {
      service.get.mockResolvedValue({ id: "p1" })
      service.list.mockResolvedValue({ items: [] })
      service.delete.mockResolvedValue(undefined)
      service.validate.mockResolvedValue({ issues: [], valid: true })

      await handlerOf(
        publicProcedures,
        "GET",
        "/v1/posts/{id}",
      )({ context: { workspace }, input: { id: "p1" } })
      await handlerOf(
        publicProcedures,
        "GET",
        "/v1/posts",
      )({ context: { workspace }, input: { limit: 30 } })
      await handlerOf(
        publicProcedures,
        "DELETE",
        "/v1/posts/{id}",
      )({ context: { workspace }, input: { params: { id: "p1" }, query: {} } })
      await handlerOf(
        publicProcedures,
        "POST",
        "/v1/posts/validate",
      )({
        context: { workspace },
        input: { targets: [{ destinationId: "d1" }] },
      })

      expect(assertNotBlocked).not.toHaveBeenCalled()
    })
  })

  describe("removing a post from the networks", () => {
    const removal = {
      targets: [{ status: "queued", targetId: "t1" }],
    }

    test("the public delete with removeFromChannels asks the remove service, after the block check, and does not delete", async () => {
      removeService.request.mockResolvedValue(removal)

      const result = await handlerOf(
        publicProcedures,
        "DELETE",
        "/v1/posts/{id}",
      )({
        context: { workspace },
        input: { params: { id: "p1" }, query: { removeFromChannels: true } },
      })

      expect(assertNotBlocked).toHaveBeenCalledWith("owner-1")
      expect(removeService.request).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: "ws-1",
      })
      expect(service.delete).not.toHaveBeenCalled()
      expect(result).toEqual({ deleted: false, removal })
    })

    test("a blocked workspace is refused before anything is queued", async () => {
      assertNotBlocked.mockRejectedValue(new Error("workspaceBlocked"))

      await expect(
        handlerOf(
          publicProcedures,
          "DELETE",
          "/v1/posts/{id}",
        )({
          context: { workspace },
          input: { params: { id: "p1" }, query: { removeFromChannels: true } },
        }),
      ).rejects.toThrow("workspaceBlocked")
      expect(removeService.request).not.toHaveBeenCalled()
    })

    test("the session twin takes the flag in its body and answers the same shape", async () => {
      removeService.request.mockResolvedValue(removal)

      const result = await handlerOf(
        privateProcedures,
        "DELETE",
        "/workspaces/{workspaceId}/social-posts/{id}",
      )({
        context: { workspace },
        input: { id: "p1", removeFromChannels: true, workspaceId: "ws-1" },
      })

      expect(result).toEqual({ deleted: false, removal })
      expect(assertNotBlocked).toHaveBeenCalledWith("owner-1")
    })

    test("a plain delete still never checks the block and reports deleted", async () => {
      service.delete.mockResolvedValue(undefined)

      const result = await handlerOf(
        publicProcedures,
        "DELETE",
        "/v1/posts/{id}",
      )({ context: { workspace }, input: { params: { id: "p1" }, query: {} } })

      expect(result).toEqual({ deleted: true, removal: null })
      expect(assertNotBlocked).not.toHaveBeenCalled()
      expect(service.delete).toHaveBeenCalledWith({
        id: "p1",
        workspaceId: "ws-1",
      })
    })
  })

  test("every read is scoped to the caller's workspace", async () => {
    service.get.mockResolvedValue({ id: "p1" })
    service.list.mockResolvedValue({ items: [] })

    await handlerOf(
      publicProcedures,
      "GET",
      "/v1/posts/{id}",
    )({ context: { workspace }, input: { id: "p1" } })
    await handlerOf(
      publicProcedures,
      "GET",
      "/v1/posts",
    )({
      context: { workspace },
      input: { limit: 10, providers: ["threads"] },
    })

    expect(service.get).toHaveBeenCalledWith({ id: "p1", workspaceId: "ws-1" })
    expect(service.list).toHaveBeenCalledWith({
      cursor: undefined,
      filters: { providers: ["threads"] },
      limit: 10,
      workspaceId: "ws-1",
    })
  })

  test("preview wraps the targets in `items`", async () => {
    service.preview.mockResolvedValue([{ issues: [], targetIndex: 0 }])

    const result = await handlerOf(
      publicProcedures,
      "POST",
      "/v1/posts/preview",
    )({
      context: { workspace },
      input: { targets: [{ destinationId: "d1" }] },
    })

    expect(result).toEqual({ items: [{ issues: [], targetIndex: 0 }] })
  })

  test("preview adds the creator-settings issues to the matching target", async () => {
    service.preview.mockResolvedValue([
      { issues: [], targetIndex: 0 },
      { issues: [], targetIndex: 1 },
    ])
    creatorIssues.mockResolvedValue([
      { code: "destinationInactive", targetIndex: 0 },
      { code: "optionsInvalid", field: "options", targetIndex: 1 },
    ])

    const result = await handlerOf(
      publicProcedures,
      "POST",
      "/v1/posts/preview",
    )({
      context: { workspace },
      input: {
        targets: [
          { destinationId: "d1", options: { privacyLevel: "SELF_ONLY" } },
          { destinationId: "d2", options: { privacyLevel: "NOPE" } },
        ],
      },
    })

    expect(result).toEqual({
      items: [
        {
          issues: [{ code: "destinationInactive", targetIndex: 0 }],
          targetIndex: 0,
        },
        {
          issues: [
            { code: "optionsInvalid", field: "options", targetIndex: 1 },
          ],
          targetIndex: 1,
        },
      ],
    })
    expect(creatorIssues).toHaveBeenCalledWith("ws-1", [
      { destinationId: "d1", options: { privacyLevel: "SELF_ONLY" } },
      { destinationId: "d2", options: { privacyLevel: "NOPE" } },
    ])
  })

  test("a target named by its inbox is resolved to its destination before the service sees it", async () => {
    service.preview.mockResolvedValue([])

    await handlerOf(
      publicProcedures,
      "POST",
      "/v1/posts/preview",
    )({
      context: { workspace },
      input: { targets: [{ inboxId: "9", text: "Hi" }] },
    })

    expect(service.preview).toHaveBeenCalledWith({
      content: { targets: [{ destinationId: "dest-of-9", text: "Hi" }] },
      workspaceId: workspace.id,
    })
  })

  test("content types need no input", async () => {
    service.contentTypes.mockReturnValue([{ provider: "threads" }])

    const result = await handlerOf(
      publicProcedures,
      "GET",
      "/v1/posts/content-types",
    )({
      context: { workspace },
    })

    expect(result).toEqual({ items: [{ provider: "threads" }] })
  })
})
