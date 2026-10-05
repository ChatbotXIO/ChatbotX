"use server"

import { validateOpenaiCompatibleBaseUrlForEnvironment } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { connectionService } from "@chatbotx.io/connections"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyOpenaiCompatibleProvider } from "../lib"
import {
  type ConnectOpenaiCompatibleSchema,
  connectOpenaiCompatibleSchema,
  resolveOpenaiCompatibleDefaultModel,
} from "../schema/request"

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

      // No `allowUpdate` — unlike the AI-key providers above,
      // `openaiCompatible` permits multiple connections per workspace (one
      // per distinct `baseURL`, which doubles as the `Connection`'s
      // `sourceId`); this is always a fresh connect, matching the legacy
      // `integrationOpenaiCompatibleService.connect` this replaces (which
      // only ever inserted a new row, never upserted one).
      try {
        await connectionService.connectFromCredentials({
          workspaceId,
          provider: "openaiCompatible",
          config: {
            ...parsedInput,
            baseURL,
            defaultModel: resolveOpenaiCompatibleDefaultModel(parsedInput),
          },
        })
      } catch (error) {
        // The satellite table's partial unique index
        // (`IntegrationOpenaiCompatible_workspaceId_preset_key`, scoped to
        // non-custom presets) rejects a second connection under an
        // already-used preset — `saveOrInsertSatellite`
        // (`@chatbotx.io/business`'s `connection/upsert.ts`) maps that
        // violation to this same `connectionAlreadyConnected` exception via
        // the binding's `duplicateConstraint`. Mirrors the legacy
        // `integrationOpenaiCompatibleService.connect`'s
        // `OpenaiCompatiblePresetAlreadyConnectedError` → `preset` field
        // mapping this replaces.
        if (isConnectionAlreadyConnectedError(error)) {
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

const isConnectionAlreadyConnectedError = (
  error: unknown,
): error is ChatbotXException =>
  error instanceof ChatbotXException &&
  error.code === "connectionAlreadyConnected"
