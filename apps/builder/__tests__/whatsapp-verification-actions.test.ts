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
  findWorkspaceIntegrationMock,
  recordRegistrationOutcomeMock,
  registerPhoneNumberMock,
  requestVerificationCodeMock,
  revalidatePathMock,
  verifyCodeMock,
} = vi.hoisted(() => ({
  claimVerificationCodeSlotMock: vi.fn(),
  findWorkspaceIntegrationMock: vi.fn(),
  recordRegistrationOutcomeMock: vi.fn(),
  registerPhoneNumberMock: vi.fn(),
  requestVerificationCodeMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  verifyCodeMock: vi.fn(),
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
    findWorkspaceIntegration: findWorkspaceIntegrationMock,
    recordRegistrationOutcome: recordRegistrationOutcomeMock,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  mapToChannelError: (error: unknown) => error,
  registerPhoneNumber: registerPhoneNumberMock,
  requestVerificationCode: requestVerificationCodeMock,
  verifyCode: verifyCodeMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
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

describe("Whatsapp verification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findWorkspaceIntegrationMock.mockResolvedValue(integration)
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
    expect(requestVerificationCodeMock).toHaveBeenCalledWith({
      auth,
      phoneNumberId: "phone-1",
      codeMethod: "SMS",
      language: "en_US",
    })
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
    findWorkspaceIntegrationMock.mockResolvedValueOnce({
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
