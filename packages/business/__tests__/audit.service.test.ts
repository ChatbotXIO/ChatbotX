import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  defaultQueueAdd: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerDebug: vi.fn(),
  normalizeError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
}))

const auditRecorderNotRegisteredMessage = /Audit recorder is not registered/

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    sendAuditLog: "sendAuditLog",
  },
  defaultQueue: {
    add: (...args: unknown[]) => mocks.defaultQueueAdd(...args),
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "11643703873355776"),
}))

vi.mock("universal-error-normalizer", () => ({
  normalizeError: (error: unknown) => mocks.normalizeError(error),
}))

vi.mock("../src/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mocks.loggerWarn(...args),
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    debug: (...args: unknown[]) => mocks.loggerDebug(...args),
  },
}))

const { getAuditActor, withAuditContext } = await import("../src/audit/context")
const { dispatchAuditRecord } = await import("../src/audit/dispatcher")
const { auditService } = await import("../src/audit/service")
const { BaseService } = await import("../src/base.service")

class TestService extends BaseService {
  emitAudit() {
    return this.audit("update", "Test detail")
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  mocks.defaultQueueAdd.mockReset()
  mocks.defaultQueueAdd.mockResolvedValue(undefined)
  mocks.loggerWarn.mockReset()
  mocks.loggerInfo.mockReset()
  mocks.loggerDebug.mockReset()
  mocks.normalizeError.mockClear()
})

describe("audit context", () => {
  test("nests workspace context without dropping request actor details", () => {
    withAuditContext(
      {
        userId: "user-1",
        ipAddress: "203.0.113.10",
        userAgent: "Vitest",
      },
      () => {
        expect(getAuditActor()).toEqual({
          userId: "user-1",
          ipAddress: "203.0.113.10",
          userAgent: "Vitest",
        })

        withAuditContext(
          { ...getAuditActor(), workspaceId: "workspace-1" },
          () => {
            expect(getAuditActor()).toEqual({
              userId: "user-1",
              workspaceId: "workspace-1",
              ipAddress: "203.0.113.10",
              userAgent: "Vitest",
            })
          },
        )

        expect(getAuditActor()).toEqual({
          userId: "user-1",
          ipAddress: "203.0.113.10",
          userAgent: "Vitest",
        })
      },
    )

    expect(getAuditActor()).toBeUndefined()
  })

  test("keeps concurrent actors isolated", async () => {
    const [first, second] = await Promise.all([
      withAuditContext({ userId: "user-1" }, async () => getAuditActor()),
      withAuditContext({ userId: "user-2" }, async () => getAuditActor()),
    ])

    expect(first).toEqual({ userId: "user-1" })
    expect(second).toEqual({ userId: "user-2" })
  })
})

describe("audit service", () => {
  test("records an audit job from ambient context", async () => {
    await withAuditContext(
      {
        userId: "user-1",
        workspaceId: "workspace-1",
        ipAddress: "203.0.113.10",
        userAgent: "Vitest",
      },
      () => auditService.record({ action: "create", detail: "Created thing" }),
    )

    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "sendAuditLog",
      {
        type: "sendAuditLog",
        data: {
          auditLogId: "11643703873355776",
          userId: "user-1",
          workspaceId: "workspace-1",
          action: "create",
          detail: "Created thing",
          ipAddress: "203.0.113.10",
          userAgent: "Vitest",
          source: undefined,
        },
      },
      { jobId: "audit-log-11643703873355776" },
    )
  })

  test("lets explicit input override ambient actor fields", async () => {
    await withAuditContext(
      {
        userId: "ambient-user",
        workspaceId: "ambient-workspace",
        ipAddress: "203.0.113.10",
        userAgent: "Ambient",
      },
      () =>
        auditService.record({
          userId: "user-2",
          workspaceId: "workspace-2",
          action: "export",
          detail: "Exported contacts",
          ipAddress: "198.51.100.8",
          userAgent: "Override",
          source: "export-contacts",
        }),
    )

    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "sendAuditLog",
      {
        type: "sendAuditLog",
        data: {
          auditLogId: "11643703873355776",
          userId: "user-2",
          workspaceId: "workspace-2",
          action: "export",
          detail: "Exported contacts",
          ipAddress: "198.51.100.8",
          userAgent: "Override",
          source: "export-contacts",
        },
      },
      { jobId: "audit-log-11643703873355776" },
    )
  })

  test("does not enqueue when actor or workspace is missing", async () => {
    await auditService.record({ action: "update", detail: "No context" })

    await withAuditContext({ userId: "user-1" }, () =>
      auditService.record({ action: "update", detail: "No workspace" }),
    )

    expect(mocks.defaultQueueAdd).not.toHaveBeenCalled()
  })

  test("swallows enqueue failures and logs a warning", async () => {
    const error = new Error("redis unavailable")
    mocks.defaultQueueAdd.mockRejectedValueOnce(error)

    await auditService.record({
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "delete",
      detail: "Deleted thing",
    })

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        err: { message: "redis unavailable" },
        workspaceId: "workspace-1",
        userId: "user-1",
        action: "delete",
        source: undefined,
      },
      "audit log enqueue failed",
    )
    expect(mocks.normalizeError).toHaveBeenCalledWith(error)
  })

  test("BaseService.audit delegates using only ambient context", async () => {
    const service = new TestService()

    await withAuditContext(
      { userId: "user-1", workspaceId: "workspace-1" },
      () => service.emitAudit(),
    )

    expect(mocks.defaultQueueAdd).toHaveBeenCalledWith(
      "sendAuditLog",
      {
        type: "sendAuditLog",
        data: {
          auditLogId: "11643703873355776",
          userId: "user-1",
          workspaceId: "workspace-1",
          action: "update",
          detail: "Test detail",
          ipAddress: undefined,
          userAgent: undefined,
          source: undefined,
        },
      },
      { jobId: "audit-log-11643703873355776" },
    )
  })

  test("throws in test/dev when explicit actor audit dispatch is not bootstrapped", () => {
    const globalForAudit = globalThis as typeof globalThis & {
      __chatbotxAuditRecord?: unknown
    }
    const original = globalForAudit.__chatbotxAuditRecord
    globalForAudit.__chatbotxAuditRecord = undefined

    try {
      expect(() =>
        dispatchAuditRecord({
          userId: "user-1",
          workspaceId: "workspace-1",
          action: "create",
          detail: "Created workspace",
        }),
      ).toThrow(auditRecorderNotRegisteredMessage)
    } finally {
      globalForAudit.__chatbotxAuditRecord = original
    }
  })
})

describe("audit stdout log (AUDIT_LOG_STDOUT)", () => {
  const record = () =>
    withAuditContext(
      {
        userId: "user-1",
        workspaceId: "workspace-1",
        ipAddress: "203.0.113.10",
        userAgent: "Vitest",
        source: "builder",
      },
      () =>
        auditService.record({
          action: "member.remove",
          detail: "Removed jane@example.com from the workspace",
        }),
    )

  test("emits nothing by default", async () => {
    await record()

    expect(mocks.loggerInfo).not.toHaveBeenCalled()
    expect(mocks.defaultQueueAdd).toHaveBeenCalledTimes(1)
  })

  test.each([
    "false",
    "1",
    "TRUE",
    "",
  ])("stays off for AUDIT_LOG_STDOUT=%j", async (value) => {
    vi.stubEnv("AUDIT_LOG_STDOUT", value)

    await record()

    expect(mocks.loggerInfo).not.toHaveBeenCalled()
  })

  test("emits one AUDIT line without `detail` when enabled", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")

    await record()

    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        audit: {
          auditLogId: "11643703873355776",
          action: "member.remove",
          userId: "user-1",
          workspaceId: "workspace-1",
          ipAddress: "203.0.113.10",
          userAgent: "Vitest",
          source: "builder",
        },
      },
      "AUDIT member.remove",
    )
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(
      "jane@example.com",
    )
  })

  test("prefixes the service name on the logged action only (BaseService.audit)", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")
    const service = new TestService()

    await withAuditContext(
      { userId: "user-1", workspaceId: "workspace-1", source: "builder" },
      () => service.emitAudit(),
    )

    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
    const [logged, msg] = mocks.loggerInfo.mock.calls[0] as [
      { audit: Record<string, unknown> },
      string,
    ]
    expect(msg).toBe("AUDIT TestService.update")
    expect(logged.audit.action).toBe("TestService.update")
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(
      "Test detail",
    )

    // The queued job (and so the audit_log row) keeps the bare verb.
    const [, job] = mocks.defaultQueueAdd.mock.calls[0] as [
      string,
      { data: { action: string; detail: string } },
    ]
    expect(job.data.action).toBe("update")
    expect(job.data.detail).toBe("Test detail")
  })

  test("the service name is not an enumerable field of the dispatched input", () => {
    const dispatched = vi.fn()
    const globalForAudit = globalThis as typeof globalThis & {
      __chatbotxAuditRecord?: unknown
    }
    const original = globalForAudit.__chatbotxAuditRecord
    globalForAudit.__chatbotxAuditRecord = dispatched

    try {
      new TestService().emitAudit()
    } finally {
      globalForAudit.__chatbotxAuditRecord = original
    }

    expect(dispatched).toHaveBeenCalledWith({
      action: "update",
      detail: "Test detail",
    })
  })

  test("logs the bare action for records raised outside BaseService", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")

    await record()

    expect(mocks.loggerInfo.mock.calls[0]?.[1]).toBe("AUDIT member.remove")
  })

  test("logs the same id that is enqueued", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")
    mocks.defaultQueueAdd.mockImplementationOnce(() => undefined)

    await record()

    const [logged] = mocks.loggerInfo.mock.calls[0] as [
      { audit: { auditLogId: string } },
    ]
    const [, job] = mocks.defaultQueueAdd.mock.calls[0] as [
      string,
      { data: { auditLogId: string } },
    ]
    expect(logged.audit.auditLogId).toBe(job.data.auditLogId)
  })

  test("emits even when the enqueue fails", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")
    mocks.defaultQueueAdd.mockRejectedValueOnce(new Error("redis unavailable"))

    await record()

    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
  })

  test("emits nothing when the record is dropped for a missing actor", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")

    await auditService.record({ action: "update", detail: "No context" })

    expect(mocks.loggerInfo).not.toHaveBeenCalled()
  })

  test("bounds the client-supplied user agent", async () => {
    vi.stubEnv("AUDIT_LOG_STDOUT", "true")

    await auditService.record({
      userId: "user-1",
      workspaceId: "workspace-1",
      action: "login",
      detail: "Signed in",
      userAgent: "x".repeat(1000),
    })

    const [logged] = mocks.loggerInfo.mock.calls[0] as [
      { audit: { userAgent: string } },
    ]
    expect(logged.audit.userAgent).toHaveLength(256)
  })
})
