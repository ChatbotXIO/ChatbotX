"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationGeminiModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyGeminiApiKey } from "../lib"
import {
  type ConnectGeminiRequest,
  connectGeminiRequest,
} from "../schemas/request"

export const connectGeminiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectGeminiRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      if (!(await verifyGeminiApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectGeminiRequest, {
          apiKey: {
            _errors: ["Invalid API key"],
          },
        })
      }

      const integrationGemini = await db.query.integrationGeminiModel.findFirst(
        {
          where: {
            workspaceId,
          },
        },
      )

      await db.transaction(async (tx) => {
        if (integrationGemini) {
          await tx
            .update(integrationGeminiModel)
            .set({
              model: parsedInput.model,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationGeminiModel.id, integrationGemini.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              workspaceId,
              integrationType: "gemini",
              id: createId(),
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationGeminiModel).values({
            workspaceId,
            model: parsedInput.model,
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
            id: createId(),
            integrationId: integration.id,
          })
        }
      })

      return
    },
  )
