// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    scopes,
    orpcMock: {
      workspaceTokenAuthAPIForScope: (scope: string) => {
        scopes.push(scope)
        return api
      },
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  recordingUrl: vi.fn(),
  transcript: vi.fn(),
  summary: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  whatsappCallHistoryService: { list: mocks.list },
  callRecordingService: { getRecordingUrlForCall: mocks.recordingUrl },
  whatsappCallTranscriptService: { getTranscriptForCall: mocks.transcript },
  whatsappCallSummaryService: { getSummaryForCall: mocks.summary },
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/whatsapp-calls/api/public")

const find = (path: string) =>
  capturedProcedures.find((p) => p.route.path === path)?.handler
const context = { workspace: { id: "ws-1" } }

describe("whatsapp call routes", () => {
  test("use the integrations scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["integrations"]))
  })

  test("list reads the whole workspace and never returns the storage path", async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          id: "1",
          createdAt: new Date(),
          direction: "userInitiated",
          status: "completed",
          outcome: "completed",
          kind: "answeredInbound",
          durationSeconds: 60,
          recordingPath: "workspaces/ws-1/calls/secret.ogg",
          conversationId: "9",
          contact: { id: "2", fullName: "Ann", avatar: null },
          inbox: { id: "3", name: "Shop" },
          answeredByUser: null,
          initiatedByUser: null,
        },
      ],
      nextCursor: null,
    })

    const result = await find("/v1/whatsapp/calls")?.({
      context,
      input: { activity: "missed" },
    })

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        member: "workspace",
        activity: "missed",
      }),
    )
    expect(result.data[0].hasRecording).toBe(true)
    expect(JSON.stringify(result)).not.toContain("secret.ogg")
    expect(result.nextCursor).toBeNull()
  })

  test("a tampered cursor is a 400, not page one", async () => {
    await expect(
      find("/v1/whatsapp/calls")?.({ context, input: { cursor: "garbage" } }),
    ).rejects.toMatchObject({ code: "invalidCursor" })
    expect(mocks.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ cursor: expect.anything() }),
    )
  })

  test("recording, transcript and summary are scoped to the token's workspace", async () => {
    mocks.recordingUrl.mockResolvedValue("https://signed.example/r")
    mocks.transcript.mockResolvedValue({
      segments: [],
      speakerNames: {},
      hasSpeakers: false,
    })
    mocks.summary.mockResolvedValue(undefined)

    await find("/v1/whatsapp/calls/{id}/recording")?.({
      context,
      input: { id: "5" },
    })
    await find("/v1/whatsapp/calls/{id}/transcript")?.({
      context,
      input: { id: "5" },
    })
    const summary = await find("/v1/whatsapp/calls/{id}/summary")?.({
      context,
      input: { id: "5" },
    })

    for (const mock of [mocks.recordingUrl, mocks.transcript, mocks.summary]) {
      expect(mock).toHaveBeenCalledWith({ callId: "5", workspaceId: "ws-1" })
    }
    expect(summary).toEqual({ summary: null, provider: null })
  })
})
