"use server"

import { sequenceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateSequenceSchema } from "../schema/action"

export const updateSequenceAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSequenceSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    const t = await getTranslations()

    try {
      await sequenceService.update({ workspaceId, id }, parsedInput)
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "validation"
      ) {
        return returnValidationErrors(updateSequenceSchema, {
          _errors: [t("sequences.validation.exception")],
          name: {
            _errors: [t("sequences.validation.nameExists")],
          },
        })
      }

      throw new Error("Failed to update sequence")
    }
  })
