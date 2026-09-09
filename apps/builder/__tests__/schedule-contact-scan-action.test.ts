// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockSchedule = vi.fn()
const mockRequireUnrestrictedContactsScope = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockGetTranslations = vi.fn()
const mockReturnValidationErrors = vi.fn((_schema, errors) => errors)

vi.mock("@chatbotx.io/business", () => ({
  contactScanService: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
  },
}))

class FakeChatbotXException extends Error {
  code: string
  httpStatusCode: number
  constructor(message: string, code = "systemError", httpStatusCode = 400) {
    super(message)
    this.code = code
    this.httpStatusCode = httpStatusCode
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mockReturnValidationErrors,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope",
  () => ({
    requireUnrestrictedContactsScope: (...args: unknown[]) =>
      mockRequireUnrestrictedContactsScope(...args),
  }),
)

const { scheduleContactScanAction: scheduleContactScanActionUntyped } =
  await import("@/features/contact-scan/actions/schedule-contact-scan.action")
const scheduleContactScanAction =
  scheduleContactScanActionUntyped as unknown as (
    props: unknown,
  ) => Promise<unknown>

// `t(key)` echoes the key itself so assertions can check exactly which key
// was looked up without hardcoding translated copy.
const fakeTranslator = Object.assign((key: string) => key, {
  has: () => true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue(fakeTranslator)
})

const baseInput = {
  bindArgsParsedInputs: ["ws-1"],
  parsedInput: { inboxId: "inbox-1", scanFromAt: new Date("2020-01-01") },
}

describe("scheduleContactScanAction", () => {
  test("returns a validation error when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const result = await scheduleContactScanAction(baseInput as never)

    expect(result).toEqual({ _errors: ["Unauthorized"] })
    expect(mockRequireUnrestrictedContactsScope).not.toHaveBeenCalled()
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  test("does not call the service when the caller has no unrestricted contacts scope (generic access error)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockRejectedValue(
      new FakeChatbotXException("User is not authorized to access contacts"),
    )

    await expect(scheduleContactScanAction(baseInput as never)).rejects.toThrow(
      "User is not authorized to access contacts",
    )

    expect(mockSchedule).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })

  test("maps contactScanForbidden to a top-level validation error for a restricted member, without calling the service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockRejectedValue(
      new FakeChatbotXException(
        "You do not have permission to run an Automatic Customer Scan.",
        "contactScanForbidden",
        403,
      ),
    )

    await expect(scheduleContactScanAction(baseInput as never)).rejects.toThrow(
      "You do not have permission to run an Automatic Customer Scan.",
    )

    expect(mockSchedule).not.toHaveBeenCalled()
    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      _errors: ["contactScan.errors.contactScanForbidden"],
    })
  })

  test("passes for a superAdmin (unrestricted scope) and calls the service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockResolvedValue({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
    mockSchedule.mockResolvedValue({ runId: "run-1" })

    const result = await scheduleContactScanAction(baseInput as never)

    expect(result).toEqual({ runId: "run-1" })
    expect(mockSchedule).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      requestedByUserId: "user-1",
      scanFromAt: baseInput.parsedInput.scanFromAt,
    })
  })

  test.each([
    ["contactScanFromTimeInvalid", "scanFromAt"],
    ["contactScanInboxNotFound", "inboxId"],
    ["contactScanChannelUnsupported", "inboxId"],
    ["contactScanIntegrationDisconnected", "inboxId"],
  ])("maps %s to a %s field-level validation error", async (code, field) => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockResolvedValue({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
    mockSchedule.mockRejectedValue(
      new FakeChatbotXException(`${code} message`, code),
    )

    await expect(scheduleContactScanAction(baseInput as never)).rejects.toThrow(
      `${code} message`,
    )

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      [field]: { _errors: [`contactScan.errors.${code}`] },
    })
  })

  test.each([
    "contactScanCooldown",
    "contactScanAlreadyRunning",
  ])("maps %s to a top-level validation error", async (code) => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockResolvedValue({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
    mockSchedule.mockRejectedValue(
      new FakeChatbotXException(`${code} message`, code, 409),
    )

    await expect(scheduleContactScanAction(baseInput as never)).rejects.toThrow(
      `${code} message`,
    )

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(expect.anything(), {
      _errors: [`contactScan.errors.${code}`],
    })
  })

  test("re-throws a non-ChatbotXException error without mapping", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" })
    mockRequireUnrestrictedContactsScope.mockResolvedValue({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
    mockSchedule.mockRejectedValue(new Error("boom"))

    await expect(scheduleContactScanAction(baseInput as never)).rejects.toThrow(
      "boom",
    )

    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})
