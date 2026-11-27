import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { placeCategoryFormSchema } from "../schema/action"

/** Maps a duplicate category name to a field error on `name`; rethrows anything else. */
export async function throwCategoryFormError(error: unknown): Promise<never> {
  if (
    error instanceof ChatbotXException &&
    error.code === "placeCategoryDuplicated"
  ) {
    const t = await getTranslations()
    return returnValidationErrors(placeCategoryFormSchema, {
      name: {
        _errors: [
          t("messages.nameAlreadyExists", {
            feature: t("fields.category.label"),
          }),
        ],
      },
    })
  }
  throw error
}
