"use server"

import {
  and,
  db,
  eq,
  findOrFail,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { getWorkspaceCacheTag } from "../queries"
import {
  type UpdateQrCodeRequest,
  updateQrCodeRequest,
} from "../schemas/action"

export const updateQrCodeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateQrCodeRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateQrCode({ workspaceId, id }, parsedInput)
  })

export const updateQrCode = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateQrCodeRequest,
) => {
  const qrCode = await findOrFail({
    table: reflinkModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "QR Code not found",
  })

  const { size, name, ...rest } = parsedInput
  const qrStyles =
    size === undefined
      ? undefined
      : { ...((qrCode.qrStyles as { size: number } | null) ?? {}), size }

  const t = await getTranslations()

  try {
    await db
      .update(reflinkModel)
      .set({
        ...rest,
        ...(name === undefined ? {} : { name: `qr_${name}` }),
        ...(qrStyles === undefined ? {} : { qrStyles }),
      })
      .where(
        and(
          eq(reflinkModel.id, qrCode.id),
          eq(reflinkModel.workspaceId, ctx.workspaceId),
        ),
      )

    await invalidateCacheByTags([getWorkspaceCacheTag(ctx.workspaceId)])
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return returnValidationErrors(updateQrCodeRequest, {
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
}
