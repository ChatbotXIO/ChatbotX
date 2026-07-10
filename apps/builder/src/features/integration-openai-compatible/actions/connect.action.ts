"use server"

import {
  integrationOpenaiCompatibleService,
  isOpenaiCompatiblePresetAlreadyConnectedError,
  validateOpenaiCompatibleBaseUrlForEnvironment,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyOpenaiCompatibleProvider } from "../lib"
import {
  type ConnectOpenaiCompatibleSchema,
  connectOpenaiCompatibleSchema,
  resolveOpenaiCompatibleDefaultModel,
} from "../schemas/request"

export const connectOpenaiCompatibleAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectOpenaiCompatibleSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectOpenaiCompatibleSchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()
      let baseURL: string
      try {
        baseURL = await validateOpenaiCompatibleBaseUrlForEnvironment(
          parsedInput.baseURL,
        )
      } catch (error) {
        if (isBaseUrlValidationError(error)) {
          return returnValidationErrors(connectOpenaiCompatibleSchema, {
            baseURL: {
              _errors: [t("openaiCompatible.validation.invalidBaseURL")],
            },
          })
        }
        throw error
      }

      const verifyResult = await verifyOpenaiCompatibleProvider({
        apiKey: parsedInput.apiKey,
        baseURL,
      })

      if (!verifyResult.ok) {
        if (verifyResult.reason === "unsafe_base_url") {
          return returnValidationErrors(connectOpenaiCompatibleSchema, {
            baseURL: {
              _errors: [t("openaiCompatible.validation.invalidBaseURL")],
            },
          })
        }
        return returnValidationErrors(connectOpenaiCompatibleSchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      try {
        await integrationOpenaiCompatibleService.connect({
          workspaceId,
          ...parsedInput,
          baseURL,
          defaultModel: resolveOpenaiCompatibleDefaultModel(parsedInput),
        })
      } catch (error) {
        if (isBaseUrlValidationError(error)) {
          return returnValidationErrors(connectOpenaiCompatibleSchema, {
            baseURL: {
              _errors: [t("openaiCompatible.validation.invalidBaseURL")],
            },
          })
        }
        if (isOpenaiCompatiblePresetAlreadyConnectedError(error)) {
          return returnValidationErrors(connectOpenaiCompatibleSchema, {
            preset: {
              _errors: [
                t("openaiCompatible.validation.presetAlreadyConnected"),
              ],
            },
          })
        }
        throw error
      }
    },
  )

const isBaseUrlValidationError = (error: unknown): error is ChatbotXException =>
  error instanceof ChatbotXException &&
  (error.code === "invalidBaseUrl" || error.code === "ssrfBlocked")
