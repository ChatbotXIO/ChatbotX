import type { SocialPostSnippetKind } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"

export const SNIPPET_KINDS: readonly SocialPostSnippetKind[] = [
  "signature",
  "hashtags",
  "text",
]

/** Static keys, so the i18n guard checks each one exists in every locale source. */
export const useSnippetKindLabels = (): Record<
  SocialPostSnippetKind,
  string
> => {
  const t = useTranslations()
  return {
    hashtags: t("composer.snippetsKinds.hashtags"),
    signature: t("composer.snippetsKinds.signature"),
    text: t("composer.snippetsKinds.text"),
  }
}
