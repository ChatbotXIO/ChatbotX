import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByWorkspaceAndEvents: vi.fn(
    async () => [] as { event: string; url: string }[],
  ),
  findByIdOrFail: vi.fn(async () => ({
    id: "contact-1",
    email: "a@example.com",
  })),
  listWithDefinitions: vi.fn(
    async () => [] as { name: string; value: string }[],
  ),
  listTagsByContactId: vi.fn(async () => [] as { name: string }[]),
  listContactSequencesByContactId: vi.fn(
    async () => [] as { sequenceId: string; sequenceName: string }[],
  ),
  execute: vi.fn(async () => ({
    statusCode: 200,
    durationMs: 10,
    responseBody: "",
    responseHeaders: {},
  })),
}))

vi.mock("@chatbotx.io/business", () => ({
  externalWebhookService: {
    listByWorkspaceAndEvents: mocks.listByWorkspaceAndEvents,
  },
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
  contactCustomFieldService: { listWithDefinitions: mocks.listWithDefinitions },
  tagService: { listByContactId: mocks.listTagsByContactId },
  externalRequestService: { execute: mocks.execute },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    listByContactId: mocks.listContactSequencesByContactId,
  },
}))

const { handleMakeStep } = await import(
  "../src/integration/handlers/make-handler"
)

const createProps = () =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    step: { id: "step-1", stepType: "make", events: ["new_order"], states: [] },
  }) as Parameters<typeof handleMakeStep>[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listByWorkspaceAndEvents.mockResolvedValue([])
  mocks.findByIdOrFail.mockResolvedValue({
    id: "contact-1",
    email: "a@example.com",
  })
  mocks.listWithDefinitions.mockResolvedValue([])
  mocks.listTagsByContactId.mockResolvedValue([])
  mocks.listContactSequencesByContactId.mockResolvedValue([])
  mocks.execute.mockResolvedValue({
    statusCode: 200,
    durationMs: 10,
    responseBody: "",
    responseHeaders: {},
  })
})

describe("handleMakeStep", () => {
  test("is a no-op when no webhook is registered for the event", async () => {
    await expect(handleMakeStep(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
    expect(mocks.findByIdOrFail).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("posts to every registered webhook and succeeds on 2xx", async () => {
    mocks.listByWorkspaceAndEvents.mockResolvedValue([
      { event: "new_order", url: "https://hook.make.com/a" },
      { event: "new_order", url: "https://hook.make.com/b" },
    ])

    await expect(handleMakeStep(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://hook.make.com/a",
        body: expect.objectContaining({ bodyType: "json" }),
      }),
      { workspaceId: "workspace-1", contactId: "contact-1" },
    )
  })

  test("returns an error state when a webhook responds with 4xx/5xx", async () => {
    mocks.listByWorkspaceAndEvents.mockResolvedValue([
      { event: "new_order", url: "https://hook.make.com/a" },
    ])
    mocks.execute.mockResolvedValue({
      statusCode: 500,
      durationMs: 10,
      responseBody: "",
      responseHeaders: {},
    })

    await expect(handleMakeStep(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: expect.stringContaining("new_order"),
    })
  })

  test("returns an error state when the request throws (e.g. SSRF block)", async () => {
    mocks.listByWorkspaceAndEvents.mockResolvedValue([
      { event: "new_order", url: "https://hook.make.com/a" },
    ])
    mocks.execute.mockRejectedValue(new Error("blocked by ssrf guard"))

    await expect(handleMakeStep(createProps())).resolves.toMatchObject({
      status: "error",
      errorMessage: "blocked by ssrf guard",
    })
  })
})
