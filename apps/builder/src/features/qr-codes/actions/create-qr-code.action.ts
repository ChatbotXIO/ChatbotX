"use server"

import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { getWorkspaceCacheTag } from "../queries"
import {
  type CreateQrCodeRequest,
  createQrCodeRequest,
} from "../schemas/action"

export const createQrCodeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createQrCodeRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateQrCodeRequest
    }) => {
      const t = await getTranslations()
      const { size, name, ...rest } = parsedInput
      const id = createId()
      try {
        await db.insert(reflinkModel).values({
          id,
          workspaceId,
          type: "qrCode",
          ...rest,
          name: `qr_${name}`,
          qrStyles: { size },
        })

        await invalidateCacheByTags([getWorkspaceCacheTag(workspaceId)])

        return { id }
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(createQrCodeRequest, {
            name: {
              _errors: [
                t("messages.nameAlreadyExists", {
                  feature: t("fields.qrCode.label"),
                }),
              ],
            },
          })
        }

        throw error
      }
    },
  )
