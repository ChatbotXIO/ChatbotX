import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  subscribeContactForTrigger: vi.fn(),
  unsubscribeContactForTrigger: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    subscribeContactForTrigger: mocks.subscribeContactForTrigger,
    unsubscribeContactForTrigger: mocks.unsubscribeContactForTrigger,
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  default: { warn: mocks.warn, error: vi.fn(), info: vi.fn() },
}))

const { addSequence, removeSequence } = await import(
  "../src/trigger/services/actions/sequence-actions"
)

type HandlerInput = Parameters<typeof addSequence>[0]

const buildInput = (action: Record<string, unknown>): HandlerInput =>
  ({
    context: { action, workspaceId: "ws-1", contactId: "contact-1" },
    conversation: { contactId: "contact-1" },
    scope: {},
  }) as unknown as HandlerInput

describe("addSequence trigger action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.subscribeContactForTrigger.mockResolvedValue({
      ownedSequenceIds: ["101"],
    })
  })

  test("subscribes the conversation's contact to the configured sequences", async () => {
    const outcome = await addSequence(
      buildInput({ type: "addSequence", sequenceIds: ["101", "102"] }),
    )

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.subscribeContactForTrigger).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["101", "102"],
    })
  })

  test("is skipped when none of the sequences exist any more", async () => {
    mocks.subscribeContactForTrigger.mockResolvedValue({ ownedSequenceIds: [] })

    await expect(
      addSequence(buildInput({ type: "addSequence", sequenceIds: ["101"] })),
    ).resolves.toEqual({ status: "skipped", reason: "sequenceNotFound" })
  })

  test.each([
    { type: "addSequence" },
    { type: "addSequence", sequenceIds: [] },
    { type: "addSequence", sequenceIds: "101" },
    { type: "addSequence", sequenceIds: [101] },
    {
      type: "addSequence",
      sequenceIds: Array.from({ length: 51 }, (_, index) => String(index + 1)),
    },
  ])("is skipped without calling the service for a malformed payload %o", async (action) => {
    await expect(addSequence(buildInput(action))).resolves.toEqual({
      status: "skipped",
      reason: "invalidAction",
    })
    expect(mocks.subscribeContactForTrigger).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("lets a service failure reach the executor's per-action error handling", async () => {
    mocks.subscribeContactForTrigger.mockRejectedValue(new Error("db down"))

    await expect(
      addSequence(buildInput({ type: "addSequence", sequenceIds: ["101"] })),
    ).rejects.toThrow("db down")
  })
})

describe("removeSequence trigger action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unsubscribeContactForTrigger.mockResolvedValue(undefined)
  })

  test("unsubscribes the conversation's contact from the configured sequences", async () => {
    const outcome = await removeSequence(
      buildInput({ type: "removeSequence", sequenceIds: ["101"] }),
    )

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.unsubscribeContactForTrigger).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["101"],
    })
  })

  test.each([
    { type: "removeSequence" },
    { type: "removeSequence", sequenceIds: [] },
    { type: "removeSequence", sequenceIds: [101] },
  ])("is skipped without calling the service for a malformed payload %o", async (action) => {
    await expect(removeSequence(buildInput(action))).resolves.toEqual({
      status: "skipped",
      reason: "invalidAction",
    })
    expect(mocks.unsubscribeContactForTrigger).not.toHaveBeenCalled()
  })

  test("lets a service failure reach the executor's per-action error handling", async () => {
    mocks.unsubscribeContactForTrigger.mockRejectedValue(new Error("db down"))

    await expect(
      removeSequence(
        buildInput({ type: "removeSequence", sequenceIds: ["101"] }),
      ),
    ).rejects.toThrow("db down")
  })
})
