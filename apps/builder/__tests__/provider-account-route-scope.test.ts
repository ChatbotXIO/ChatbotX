// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { addMock, continuesFlowMock, loggerError } = vi.hoisted(() => ({
  addMock: vi.fn(),
  continuesFlowMock: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    providerAccountEvent: "providerAccountEvent",
    messageStatus: "messageStatus",
  },
  enqueueIntegrationJob: (job: { type: string }, options: unknown) =>
    addMock(job.type, job, options),
}))
vi.mock("@chatbotx.io/business", () => ({
  messageStatusBranchService: { continuesFlow: continuesFlowMock },
}))
vi.mock("@/lib/log", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  addRouteScopedJob,
  createRouteScopedQueue,
} from "@/lib/provider-account-route-scope"

const accountEventJob = {
  type: "providerAccountEvent",
  data: {
    event: "revoked",
    account: { kind: "businessAccount", id: "waba-1" },
  },
}
const BASE_JOB_ID = "provider-account-whatsapp-waba-1-revoked-1-abc"
const platform = { kind: "platform", appId: "app-1" } as const
const owner = (ownerId: string) =>
  ({ kind: "credentialOwner", ownerId, appId: "app-1" }) as const

beforeEach(() => {
  addMock.mockReset()
  continuesFlowMock.mockReset()
  loggerError.mockReset()
})

describe("addRouteScopedJob", () => {
  test("stamps the scope on a provider account event without mutating the input", async () => {
    await addRouteScopedJob(
      "providerAccountEvent",
      accountEventJob,
      { jobId: BASE_JOB_ID },
      owner("owner-1"),
    )

    expect(addMock).toHaveBeenCalledWith(
      "providerAccountEvent",
      {
        type: "providerAccountEvent",
        data: { ...accountEventJob.data, routeScope: owner("owner-1") },
      },
      { jobId: `${BASE_JOB_ID}-owner-owner-1` },
    )
    expect(accountEventJob.data).not.toHaveProperty("routeScope")
  })

  test("overrides a scope a forged payload tried to carry", async () => {
    await addRouteScopedJob(
      "providerAccountEvent",
      {
        ...accountEventJob,
        data: { ...accountEventJob.data, routeScope: platform },
      },
      { jobId: BASE_JOB_ID },
      owner("owner-1"),
    )

    const [, job] = addMock.mock.calls[0] as [
      string,
      { data: { routeScope: unknown } },
    ]
    expect(job.data.routeScope).toEqual(owner("owner-1"))
  })

  test("drops the event and logs when the route has no scope", async () => {
    await addRouteScopedJob(
      "providerAccountEvent",
      accountEventJob,
      { jobId: BASE_JOB_ID },
      undefined,
    )

    expect(addMock).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledOnce()
  })

  test("passes every other job through untouched, scope or not", async () => {
    const messageJob = { type: "incomingMessage", data: { id: "1" } }

    await addRouteScopedJob(
      "incomingMessage",
      messageJob,
      { jobId: "wa-msg-1" },
      undefined,
    )

    expect(addMock).toHaveBeenCalledWith("incomingMessage", messageJob, {
      jobId: "wa-msg-1",
    })
  })
})

describe("message status routing stamp", () => {
  const statusJob = {
    type: "messageStatus",
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "phone-1",
      payload: { messageId: "wamid.1", status: "delivered", timestamp: "1" },
    },
  }

  test.each([
    true,
    false,
  ])("stamps continuesFlow=%s from the status-branch marker", async (continuesFlow) => {
    continuesFlowMock.mockResolvedValue(continuesFlow)

    await addRouteScopedJob(
      "messageStatus",
      statusJob,
      { jobId: "wa-status-1" },
      undefined,
    )

    expect(continuesFlowMock).toHaveBeenCalledWith({
      channel: "whatsapp",
      providerMessageId: "wamid.1",
      status: "delivered",
    })
    expect(addMock).toHaveBeenCalledWith(
      "messageStatus",
      { ...statusJob, data: { ...statusJob.data, continuesFlow } },
      { jobId: "wa-status-1" },
    )
  })

  test("overrides a continuesFlow flag the payload already carried", async () => {
    continuesFlowMock.mockResolvedValue(false)

    await addRouteScopedJob(
      "messageStatus",
      { ...statusJob, data: { ...statusJob.data, continuesFlow: true } },
      undefined,
      undefined,
    )

    const [, job] = addMock.mock.calls[0] as [
      string,
      { data: { continuesFlow: boolean } },
    ]
    expect(job.data.continuesFlow).toBe(false)
  })
})

describe("route-specific job ids", () => {
  const jobIdFor = async (
    routeScope: Parameters<typeof addRouteScopedJob>[3],
  ): Promise<string> => {
    addMock.mockReset()
    await addRouteScopedJob(
      "providerAccountEvent",
      accountEventJob,
      { jobId: BASE_JOB_ID },
      routeScope,
    )
    return (addMock.mock.calls[0] as [string, unknown, { jobId: string }])[2]
      .jobId
  }

  test("the same Meta event delivered to different routes gets a different job id", async () => {
    const ids = [
      await jobIdFor(platform),
      await jobIdFor(owner("owner-1")),
      await jobIdFor(owner("owner-2")),
      await jobIdFor({
        kind: "manualIntegration",
        integrationId: "int-1",
        workspaceId: "ws-1",
      }),
    ]

    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).not.toContain(":")
    }
  })

  test("the same route and event keeps a stable job id so redeliveries collapse", async () => {
    expect(await jobIdFor(owner("owner-1"))).toBe(
      await jobIdFor(owner("owner-1")),
    )
  })
})

describe("createRouteScopedQueue", () => {
  test("forwards the job name and options for a manual route", async () => {
    const queue = createRouteScopedQueue({
      kind: "manualIntegration",
      integrationId: "int-1",
      workspaceId: "ws-1",
    })

    await queue.add("providerAccountEvent", accountEventJob, { jobId: "job-1" })

    expect(addMock).toHaveBeenCalledWith(
      "providerAccountEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          routeScope: {
            kind: "manualIntegration",
            integrationId: "int-1",
            workspaceId: "ws-1",
          },
        }),
      }),
      { jobId: "job-1-manual-int-1" },
    )
  })
})
