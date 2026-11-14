// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCancel = vi.fn()
const mockRequireUnrestrictedContactsScope = vi.fn()
const clientUsed = vi.hoisted(() => ({ name: "" }))

vi.mock("@chatbotx.io/business", () => ({
  contactScanService: { cancel: (...args: unknown[]) => mockCancel(...args) },
}))

vi.mock("@/features/common/schema", () => ({ workspaceIdrequestParams: [] }))

// Cancel must keep working after the trial expires (invariant 14), so it must
// be built on the allow-expired client and never on the plain one.
vi.mock("@/lib/safe-action", () => {
  const chain = (name: string) => ({
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: (fn: unknown) => {
          clientUsed.name = name
          return fn
        },
      }),
    }),
  })
  return {
    workspaceActionClientAllowExpired: chain("allowExpired"),
    workspaceActionClient: chain("plain"),
  }
})

vi.mock(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope",
  () => ({
    requireUnrestrictedContactsScope: (...args: unknown[]) =>
      mockRequireUnrestrictedContactsScope(...args),
  }),
)

const { cancelContactScanAction: untyped } = await import(
  "@/features/contact-scan/actions/cancel-contact-scan.action"
)
const cancelContactScanAction = untyped as unknown as (props: {
  bindArgsParsedInputs: [string]
  parsedInput: { inboxId: string }
}) => Promise<unknown>

const run = () =>
  cancelContactScanAction({
    bindArgsParsedInputs: ["ws-1"],
    parsedInput: { inboxId: "inbox-1" },
  })

describe("cancelContactScanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUnrestrictedContactsScope.mockResolvedValue(undefined)
    mockCancel.mockResolvedValue({ cancelled: true })
  })

  test("is built on the allow-expired client", () => {
    expect(clientUsed.name).toBe("allowExpired")
  })

  test("checks the contacts scope, then cancels the inbox's scan", async () => {
    await expect(run()).resolves.toEqual({ cancelled: true })

    expect(mockRequireUnrestrictedContactsScope).toHaveBeenCalledWith("ws-1")
    expect(mockCancel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("an assigned-only member is denied and nothing is cancelled", async () => {
    mockRequireUnrestrictedContactsScope.mockRejectedValue(
      new Error("contactScanForbidden"),
    )

    await expect(run()).rejects.toThrow("contactScanForbidden")
    expect(mockCancel).not.toHaveBeenCalled()
  })

  test("passes cancelled:false through when nothing is running", async () => {
    mockCancel.mockResolvedValue({ cancelled: false })
    await expect(run()).resolves.toEqual({ cancelled: false })
  })
})
