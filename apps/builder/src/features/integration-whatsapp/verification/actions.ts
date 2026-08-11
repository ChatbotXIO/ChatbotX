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
  readWhatsappOriginErrorDetail,
  registerPhoneNumber,
  requestVerificationCode,
  verifyCode,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { logger } from "@/lib/log"
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

const ERROR_MESSAGES_NAMESPACE = "whatsapp.phoneVerification.errors"

function getIntegrationAuth(
  integration: IntegrationWhatsappModel,
): WhatsappAuthValue {
  return integration.auth as WhatsappAuthValue
}

/**
 * Prefers whatever Meta wrote for the operator to read, since it names the
 * concrete blocker ("this number is on another WABA"), and only falls back to
 * our own wording when the payload carries nothing usable.
 */
function buildActionErrorMessage(
  registrationError: IntegrationWhatsappRegistrationError | null | undefined,
  fallbackMessage: string,
): string {
  return (
    registrationError?.userMessage ??
    registrationError?.userTitle ??
    registrationError?.message ??
    fallbackMessage
  )
}

function buildWhatsappApiActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const channelError = mapToChannelError(error)
  const originError = readWhatsappOriginErrorDetail(
    channelError.getOriginError(),
  )

  return (
    originError.userMessage ??
    originError.userTitle ??
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
  notFoundMessage: string
}) {
  const integration = await integrationWhatsappService.findByIdForWorkspace({
    id: input.integrationId,
    workspaceId: input.workspaceId,
  })

  if (!integration) {
    throw new ChatbotXException(input.notFoundMessage)
  }

  return integration
}

async function retryRegistration(input: {
  workspaceId: string
  integrationId: string
  auth: WhatsappAuthValue
  phoneNumberId: string
  isCoexist: boolean
  fallbackMessage: string
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
    throw new ChatbotXException(
      buildActionErrorMessage(registrationError, input.fallbackMessage),
    )
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
      const t = await getTranslations(ERROR_MESSAGES_NAMESPACE)
      const integration = await getWorkspaceIntegration({
        workspaceId,
        integrationId: parsedInput.integrationId,
        notFoundMessage: t("integrationNotFound"),
      })

      const slot = await integrationWhatsappService.claimVerificationCodeSlot({
        id: integration.id,
        workspaceId,
        cooldownSeconds: WHATSAPP_VERIFICATION_COOLDOWN_SECONDS,
      })

      if (slot.status === "not_found") {
        throw new ChatbotXException(t("integrationNotFound"))
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
        })
      } catch (error) {
        // Meta never sent a code, so the cooldown this claim started would
        // punish the operator for our failure. Hand the slot back so the retry
        // is immediate — but only as a best effort: why Meta refused is what
        // the operator has to see, and letting a database failure surface in
        // its place would replace the real reason with a confusing one.
        await integrationWhatsappService
          .releaseVerificationCodeSlot({
            id: integration.id,
            workspaceId,
            claimedAt: slot.requestedAt,
          })
          .catch((releaseError: unknown) => {
            logger.error(
              { err: releaseError, integrationId: integration.id, workspaceId },
              "Failed to release WhatsApp verification code slot",
            )
          })

        throwWhatsappApiActionError(error, t("codeNotSent"))
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
      const t = await getTranslations(ERROR_MESSAGES_NAMESPACE)
      const integration = await getWorkspaceIntegration({
        workspaceId,
        integrationId: parsedInput.integrationId,
        notFoundMessage: t("integrationNotFound"),
      })
      const auth = getIntegrationAuth(integration)

      try {
        await verifyCode({
          auth,
          phoneNumberId: integration.phoneNumberId,
          code: parsedInput.code,
        })
      } catch (error) {
        throwWhatsappApiActionError(error, t("codeNotVerified"))
      }

      await retryRegistration({
        workspaceId,
        integrationId: integration.id,
        auth,
        phoneNumberId: integration.phoneNumberId,
        isCoexist: integration.isCoexist,
        fallbackMessage: t("registrationFailed"),
      })

      const integrationPath = `/space/${workspaceId}/whatsapps/${integration.id}`
      revalidatePath(integrationPath)
      revalidatePath(`${integrationPath}/account-healths`)

      return { status: "registered" }
    },
  )
