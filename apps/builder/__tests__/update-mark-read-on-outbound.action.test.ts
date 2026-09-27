// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockUpdateMarkReadOnOutbound = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    updateMarkReadOnOutbound: (...args: unknown[]) =>
      mockUpdateMarkReadOnOutbound(...args),
  },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

const {
  updateMarkReadOnOutboundAction: updateMarkReadOnOutboundActionUntyped,
} = await import(
  "../src/features/inboxes/actions/update-mark-read-on-outbound.action"
)
const updateMarkReadOnOutboundAction =
  updateMarkReadOnOutboundActionUntyped as unknown as (
    props: unknown,
  ) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("updateMarkReadOnOutboundAction", () => {
  test("delegates to inboxService and returns the updated setting", async () => {
    mockUpdateMarkReadOnOutbound.mockResolvedValue({ markReadOnOutbound: true })

    const result = await updateMarkReadOnOutboundAction({
      bindArgsParsedInputs: ["workspace-1", "inbox-1"],
      parsedInput: { enabled: true },
    } as never)

    expect(mockUpdateMarkReadOnOutbound).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "inbox-1",
      enabled: true,
    })
    expect(result).toEqual({ markReadOnOutbound: true })
  })

  test("propagates a service rejection", async () => {
    const serviceError = new Error("Inbox not found")
    mockUpdateMarkReadOnOutbound.mockRejectedValue(serviceError)

    await expect(
      updateMarkReadOnOutboundAction({
        bindArgsParsedInputs: ["workspace-1", "missing-inbox"],
        parsedInput: { enabled: false },
      } as never),
    ).rejects.toBe(serviceError)
  })
})
