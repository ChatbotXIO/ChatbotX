import {
  createStarterDefinition,
  type MiniAppDefinition,
} from "@chatbotx.io/mini-app"
import { getTranslations } from "next-intl/server"
import { defaultTextKey } from "./labels"

/**
 * The one-screen starter a Mini App gets when it is created from a name
 * alone, translated for the caller. Shared by the builder action and the
 * public API.
 */
export async function createTranslatedStarterDefinition(): Promise<MiniAppDefinition> {
  const t = await getTranslations()
  return createStarterDefinition(t("miniApps.editor.newScreenTitle"), (key) =>
    t(defaultTextKey[key]),
  )
}
