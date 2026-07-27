"use server"

import {
  integrationWhatsappService,
  type RegistrationOutcome,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { IntegrationWhatsappRegistrationError } from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import {
  mapToChannelError,
  registerPhoneNumber,
  requestVerificationCode,
  verifyCode,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidatePath } from "next/cache"
import { workspaceActionClient } from "@/lib/safe-action"
import { toRegistrationOutcome } from "../libs/registration-outcome"
import {
  requestWhatsappVerificationCodeSchema,
  verifyWhatsappPhoneCodeSchema,
  WHATSAPP_VERIFICATION_COOLDOWN_SECONDS,
  type WhatsappVerificationRequestResult,
} from "./schema"

type VerifyWhatsappPhoneCodeResult = {
  status: "registered"
}

const VERIFICATION_LANGUAGE = "en_US"

type WhatsappUserFacingError = {
  userTitle?: string
  userMessage?: string
}

function getIntegrationAuth(
  integration: IntegrationWhatsappModel,
): WhatsappAuthValue {
  return integration.auth as WhatsappAuthValue
}

function buildActionErrorMessage(
  registrationError: IntegrationWhatsappRegistrationError | null | undefined,
): string {
  return (
    registrationError?.userMessage ??
    registrationError?.userTitle ??
    registrationError?.message ??
    "WhatsApp phone number verification failed"
  )
}

function readWhatsappUserFacingError(
  originError: unknown,
): WhatsappUserFacingError {
  if (typeof originError !== "object" || originError === null) {
    return {}
  }

  const source = originError as Record<string, unknown>

  return {
    userTitle:
      typeof source.userTitle === "string" ? source.userTitle : undefined,
    userMessage:
      typeof source.userMessage === "string" ? source.userMessage : undefined,
  }
}

function buildWhatsappApiActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const channelError = mapToChannelError(error)
  const userFacingError = readWhatsappUserFacingError(
    channelError.getOriginError(),
  )

  return (
    userFacingError.userMessage ??
    userFacingError.userTitle ??
    channelError.message ??
    fallbackMessage
  )
}

function throwWhatsappApiActionError(
  error: unknown,
  fallbackMessage: string,
): never {
  throw new ChatbotXException(
    buildWhatsappApiActionErrorMessage(error, fallbackMessage),
  )
}

async function getWorkspaceIntegration(input: {
  workspaceId: string
  integrationId: string
}) {
  const integration = await integrationWhatsappService.findWorkspaceIntegration(
    {
      id: input.integrationId,
      workspaceId: input.workspaceId,
    },
  )

  if (!integration) {
    throw new ChatbotXException("Whatsapp integration not found")
  }

  return integration
}

async function retryRegistration(input: {
  workspaceId: string
  integrationId: string
  auth: WhatsappAuthValue
  phoneNumberId: string
  isCoexist: boolean
}): Promise<void> {
  if (input.isCoexist) {
    await integrationWhatsappService.recordRegistrationOutcome({
      id: input.integrationId,
      workspaceId: input.workspaceId,
      outcome: { status: "registered" },
    })
    return
  }

  const registrationResult = await registerPhoneNumber({
    auth: input.auth,
    phoneNumberId: input.phoneNumberId,
  })
  const outcome: RegistrationOutcome = toRegistrationOutcome(registrationResult)
  const registrationError =
    await integrationWhatsappService.recordRegistrationOutcome({
      id: input.integrationId,
      workspaceId: input.workspaceId,
      outcome,
    })

  if (outcome.status !== "registered") {
    throw new ChatbotXException(buildActionErrorMessage(registrationError))
  }
}

export const requestWhatsappVerificationCodeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(requestWhatsappVerificationCodeSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }): Promise<WhatsappVerificationRequestResult> => {
      const integration = await getWorkspaceIntegration({
        workspaceId,
        integrationId: parsedInput.integrationId,
      })

      const slot = await integrationWhatsappService.claimVerificationCodeSlot({
        id: integration.id,
        workspaceId,
        cooldownSeconds: WHATSAPP_VERIFICATION_COOLDOWN_SECONDS,
      })

      if (slot.status === "not_found") {
        throw new ChatbotXException("Whatsapp integration not found")
      }

      if (slot.status === "cooldown") {
        return {
          status: "cooldown",
          requestedAt: slot.requestedAt?.toISOString() ?? null,
          remainingSeconds: slot.remainingSeconds,
        }
      }

      try {
        await requestVerificationCode({
          auth: getIntegrationAuth(integration),
          phoneNumberId: integration.phoneNumberId,
          codeMethod: parsedInput.codeMethod,
          language: VERIFICATION_LANGUAGE,
        })
      } catch (error) {
        throwWhatsappApiActionError(
          error,
          "WhatsApp verification code could not be sent",
        )
      }

      return {
        status: "sent",
        requestedAt: slot.requestedAt.toISOString(),
      }
    },
  )

export const verifyWhatsappPhoneCodeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(verifyWhatsappPhoneCodeSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }): Promise<VerifyWhatsappPhoneCodeResult> => {
      const integration = await getWorkspaceIntegration({
        workspaceId,
        integrationId: parsedInput.integrationId,
      })
      const auth = getIntegrationAuth(integration)

      try {
        await verifyCode({
          auth,
          phoneNumberId: integration.phoneNumberId,
          code: parsedInput.code,
        })
      } catch (error) {
        throwWhatsappApiActionError(
          error,
          "WhatsApp verification code could not be verified",
        )
      }

      await retryRegistration({
        workspaceId,
        integrationId: integration.id,
        auth,
        phoneNumberId: integration.phoneNumberId,
        isCoexist: integration.isCoexist,
      })

      const integrationPath = `/space/${workspaceId}/whatsapps/${integration.id}`
      revalidatePath(integrationPath)
      revalidatePath(`${integrationPath}/account-healths`)

      return { status: "registered" }
    },
  )
