// @vitest-environment node

import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

type RequestCodeActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: {
    integrationId: string
    codeMethod: "SMS" | "VOICE"
  }
}) => Promise<unknown>

type VerifyCodeActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: {
    integrationId: string
    code: string
  }
}) => Promise<unknown>

const {
  claimVerificationCodeSlotMock,
  findByIdForWorkspaceMock,
  loggerErrorMock,
  recordRegistrationOutcomeMock,
  registerPhoneNumberMock,
  releaseVerificationCodeSlotMock,
  requestVerificationCodeMock,
  revalidatePathMock,
  verifyCodeMock,
} = vi.hoisted(() => ({
  claimVerificationCodeSlotMock: vi.fn(),
  findByIdForWorkspaceMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  recordRegistrationOutcomeMock: vi.fn(),
  registerPhoneNumberMock: vi.fn(),
  releaseVerificationCodeSlotMock: vi.fn(),
  requestVerificationCodeMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  verifyCodeMock: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: loggerErrorMock },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    claimVerificationCodeSlot: claimVerificationCodeSlotMock,
    findByIdForWorkspace: findByIdForWorkspaceMock,
    recordRegistrationOutcome: recordRegistrationOutcomeMock,
    releaseVerificationCodeSlot: releaseVerificationCodeSlotMock,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  mapToChannelError: (error: unknown) => error,
  readWhatsappOriginErrorDetail: (originError: unknown) => {
    const asRecord = (value: unknown): Record<string, unknown> | undefined =>
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined

    const readString = (
      source: Record<string, unknown> | undefined,
      key: string,
    ): string | undefined =>
      typeof source?.[key] === "string" ? (source[key] as string) : undefined

    const source = asRecord(originError)
    const error = asRecord(source?.error)

    return {
      userTitle:
        readString(source, "userTitle") ??
        readString(error, "error_user_title"),
      userMessage:
        readString(source, "userMessage") ??
        readString(error, "error_user_msg"),
    }
  },
  registerPhoneNumber: registerPhoneNumberMock,
  requestVerificationCode: requestVerificationCodeMock,
  verifyCode: verifyCodeMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

// Vitest resolves `next-intl/server` to next-intl's react-client build, whose
// `getTranslations` throws outright. Mirrors the real `en.json` values so the
// fallback assertions below read as the operator would see them.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn((namespace?: string) => {
    const messages: Record<string, string> = {
      "whatsapp.phoneVerification.errors.integrationNotFound":
        "WhatsApp integration not found.",
      "whatsapp.phoneVerification.errors.codeNotSent":
        "WhatsApp verification code could not be sent.",
      "whatsapp.phoneVerification.errors.codeNotVerified":
        "WhatsApp verification code could not be verified.",
      "whatsapp.phoneVerification.errors.registrationFailed":
        "WhatsApp phone number verification failed.",
    }

    return Promise.resolve(
      (key: string) => messages[namespace ? `${namespace}.${key}` : key] ?? key,
    )
  }),
}))

const { requestWhatsappVerificationCodeAction, verifyWhatsappPhoneCodeAction } =
  await import("@/features/integration-whatsapp/verification/actions")
const { verifyWhatsappPhoneCodeSchema } = await import(
  "@/features/integration-whatsapp/verification/schema"
)

const requestCodeAction =
  requestWhatsappVerificationCodeAction as unknown as RequestCodeActionHandler
const verifyPhoneCodeAction =
  verifyWhatsappPhoneCodeAction as unknown as VerifyCodeActionHandler

const auth = {
  tokens: { accessToken: "access-token-1" },
  metadata: {
    wabaId: "waba-1",
    businessId: "business-1",
    phoneNumber: { id: "phone-1" },
  },
  version: "v23.0",
}

const integration = {
  id: "integration-1",
  workspaceId: "workspace-1",
  phoneNumberId: "phone-1",
  auth,
  isCoexist: false,
}

/**
 * A rejection shaped the way Meta actually rejects `request_code`: the useful
 * sentence lives on the origin error, not on the exception message.
 */
const metaRefusedError = () =>
  new ChannelError(
    "Invalid parameter",
    ChannelErrorCategory.PAYLOAD_INVALID,
  ).setOriginError({
    userTitle: "Cannot send code",
    userMessage: "This number cannot receive SMS.",
  })

describe("Whatsapp verification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByIdForWorkspaceMock.mockResolvedValue(integration)
    releaseVerificationCodeSlotMock.mockResolvedValue(undefined)
    claimVerificationCodeSlotMock.mockResolvedValue({
      status: "claimed",
      requestedAt: new Date("2026-07-27T08:00:00.000Z"),
    })
    requestVerificationCodeMock.mockResolvedValue({ success: true })
    verifyCodeMock.mockResolvedValue({ success: true })
    registerPhoneNumberMock.mockResolvedValue({ status: "registered" })
    recordRegistrationOutcomeMock.mockResolvedValue(null)
  })

  test("requests a verification code through the scoped integration auth", async () => {
    const result = await requestCodeAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {
        integrationId: "integration-1",
        codeMethod: "SMS",
      },
    })

    expect(result).toEqual({
      status: "sent",
      requestedAt: "2026-07-27T08:00:00.000Z",
    })
    // No `language` — the action leaves it unset so `requestVerificationCode`
    // applies DEFAULT_WHATSAPP_VERIFICATION_LANGUAGE, keeping one owner for the
    // default instead of a copy on every caller.
    expect(requestVerificationCodeMock).toHaveBeenCalledWith({
      auth,
      phoneNumberId: "phone-1",
      codeMethod: "SMS",
    })
  })

  test("keeps the integration not-found message when the slot claim finds no row", async () => {
    claimVerificationCodeSlotMock.mockResolvedValueOnce({ status: "not_found" })

    await expect(
      requestCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          codeMethod: "SMS",
        },
      }),
    ).rejects.toThrow("WhatsApp integration not found.")
    expect(requestVerificationCodeMock).not.toHaveBeenCalled()
  })

  test("returns cooldown without calling Meta when another code was requested recently", async () => {
    claimVerificationCodeSlotMock.mockResolvedValueOnce({
      status: "cooldown",
      requestedAt: new Date("2026-07-27T08:00:00.000Z"),
      remainingSeconds: 42,
    })

    const result = await requestCodeAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {
        integrationId: "integration-1",
        codeMethod: "VOICE",
      },
    })

    expect(result).toEqual({
      status: "cooldown",
      requestedAt: "2026-07-27T08:00:00.000Z",
      remainingSeconds: 42,
    })
    expect(requestVerificationCodeMock).not.toHaveBeenCalled()
  })

  test("throws Meta user message when verification code cannot be sent", async () => {
    requestVerificationCodeMock.mockRejectedValueOnce(
      new ChannelError("Request code error", ChannelErrorCategory.AUTH_FAILED, {
        code: 136_024,
        subCode: 2_388_091,
        type: "OAuthException",
      }).setOriginError({
        userTitle: "Code couldn't be sent",
        userMessage: "Request code failed: Please try again in some time.",
      }),
    )

    await expect(
      requestCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          codeMethod: "SMS",
        },
      }),
    ).rejects.toThrow("Request code failed: Please try again in some time.")
  })

  test("throws Facebook's raw error_user_msg when request_code returns a Graph error payload", async () => {
    requestVerificationCodeMock.mockRejectedValueOnce(
      new ChannelError(
        "Invalid parameter",
        ChannelErrorCategory.PAYLOAD_INVALID,
      ).setOriginError({
        error: {
          error_user_title: "Code couldn't be sent",
          error_user_msg: "Request code failed: Please try again in some time.",
          fbtrace_id: "trace-1",
        },
      }),
    )

    await expect(
      requestCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          codeMethod: "SMS",
        },
      }),
    ).rejects.toThrow("Request code failed: Please try again in some time.")
  })

  test("releases the cooldown slot when Meta never sent the code", async () => {
    requestVerificationCodeMock.mockRejectedValueOnce(metaRefusedError())

    await expect(
      requestCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          codeMethod: "SMS",
        },
      }),
    ).rejects.toThrow("This number cannot receive SMS.")

    // Without this the operator would wait out a full cooldown for a code that
    // was never delivered, so the retry has to be immediate.
    expect(releaseVerificationCodeSlotMock).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      claimedAt: new Date("2026-07-27T08:00:00.000Z"),
    })
  })

  test("still reports Meta's reason when handing the slot back fails", async () => {
    requestVerificationCodeMock.mockRejectedValueOnce(metaRefusedError())
    releaseVerificationCodeSlotMock.mockRejectedValueOnce(
      new Error("database unavailable"),
    )

    // Releasing the slot is a courtesy. What the operator has to see is why
    // Meta refused, so a failed release is logged rather than surfaced.
    await expect(
      requestCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          codeMethod: "SMS",
        },
      }),
    ).rejects.toThrow("This number cannot receive SMS.")

    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "integration-1" }),
      "Failed to release WhatsApp verification code slot",
    )
  })

  test("keeps the cooldown slot when Meta accepted the request", async () => {
    await requestCodeAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {
        integrationId: "integration-1",
        codeMethod: "SMS",
      },
    })

    expect(releaseVerificationCodeSlotMock).not.toHaveBeenCalled()
  })

  test("verifies the OTP then retries phone registration", async () => {
    const result = await verifyPhoneCodeAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {
        integrationId: "integration-1",
        code: "123456",
      },
    })

    expect(result).toEqual({ status: "registered" })
    expect(verifyCodeMock).toHaveBeenCalledWith({
      auth,
      phoneNumberId: "phone-1",
      code: "123456",
    })
    expect(registerPhoneNumberMock).toHaveBeenCalledWith({
      auth,
      phoneNumberId: "phone-1",
    })
    expect(recordRegistrationOutcomeMock).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      outcome: { status: "registered" },
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/space/workspace-1/whatsapps/integration-1",
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/space/workspace-1/whatsapps/integration-1/account-healths",
    )
  })

  test("throws Meta user message when OTP verification fails", async () => {
    verifyCodeMock.mockRejectedValueOnce(
      new ChannelError(
        "Verify code error",
        ChannelErrorCategory.PAYLOAD_INVALID,
        {
          code: 136_025,
          subCode: null,
          type: "OAuthException",
        },
      ).setOriginError({
        userTitle: "Code couldn't be verified",
        userMessage: "The verification code is invalid or expired.",
      }),
    )

    await expect(
      verifyPhoneCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          code: "123456",
        },
      }),
    ).rejects.toThrow("The verification code is invalid or expired.")
    expect(registerPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("does not call register after OTP for coexist integrations", async () => {
    findByIdForWorkspaceMock.mockResolvedValueOnce({
      ...integration,
      isCoexist: true,
    })

    await verifyPhoneCodeAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: {
        integrationId: "integration-1",
        code: "123456",
      },
    })

    expect(registerPhoneNumberMock).not.toHaveBeenCalled()
    expect(recordRegistrationOutcomeMock).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      outcome: { status: "registered" },
    })
  })

  test("throws the stored Meta user message when registration still needs verification", async () => {
    const registrationError = {
      code: 100,
      subCode: 2_593_005,
      message: "Invalid parameter",
      userMessage: "Phone number is not verified through SMS or voice.",
      at: "2026-07-27T08:00:00.000Z",
    }
    registerPhoneNumberMock.mockResolvedValueOnce({
      status: "verification_required",
      error: new ChannelError(
        "Invalid parameter",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 100, subCode: 2_593_005 },
      ),
    })
    recordRegistrationOutcomeMock.mockResolvedValueOnce(registrationError)

    await expect(
      verifyPhoneCodeAction({
        bindArgsParsedInputs: ["workspace-1"],
        parsedInput: {
          integrationId: "integration-1",
          code: "123456",
        },
      }),
    ).rejects.toThrow("Phone number is not verified through SMS or voice.")
  })

  test("requires a six-digit numeric OTP", () => {
    expect(
      verifyWhatsappPhoneCodeSchema.safeParse({
        integrationId: "integration-1",
        code: "123456",
      }).success,
    ).toBe(true)
    expect(
      verifyWhatsappPhoneCodeSchema.safeParse({
        integrationId: "integration-1",
        code: "abcdef",
      }).success,
    ).toBe(false)
    expect(
      verifyWhatsappPhoneCodeSchema.safeParse({
        integrationId: "integration-1",
        code: "12345",
      }).success,
    ).toBe(false)
  })
})
