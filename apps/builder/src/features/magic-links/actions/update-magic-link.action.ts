"use server"

import { magicLinkService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateMagicLinkRequest,
  updateMagicLinkRequest,
} from "../schema/action"

export const updateMagicLinkAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMagicLinkRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateMagicLink(
      {
        workspaceId,
        id,
      },
      parsedInput,
    )
  })

export const updateMagicLink = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateMagicLinkRequest,
) => {
  try {
    await magicLinkService.update({ ...ctx, data: parsedInput })
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "validation") {
      return returnValidationErrors(updateMagicLinkRequest, {
        _errors: ["Validation Exception"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw error
  }
}
