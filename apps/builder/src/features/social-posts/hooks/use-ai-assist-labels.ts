import { useTranslations } from "next-intl"
import type { z } from "zod"
import type { generatePostTextFields } from "@/features/social-posts-ai/schema"

export type AiMode = z.infer<typeof generatePostTextFields>["mode"]
export type AiTone = NonNullable<z.infer<typeof generatePostTextFields>["tone"]>

export const AI_MODES: readonly AiMode[] = [
  "write",
  "rewrite",
  "shorten",
  "expand",
  "tone",
  "fit",
  "hashtags",
]

export const AI_TONES: readonly AiTone[] = [
  "friendly",
  "professional",
  "casual",
  "playful",
  "formal",
  "persuasive",
  "inspiring",
]

/** Static keys, so the i18n guard checks each one exists in every locale source. */
export const useAiModeLabels = (): Record<AiMode, string> => {
  const t = useTranslations()
  return {
    expand: t("composer.aiModes.expand"),
    fit: t("composer.aiModes.fit"),
    hashtags: t("composer.aiModes.hashtags"),
    rewrite: t("composer.aiModes.rewrite"),
    shorten: t("composer.aiModes.shorten"),
    tone: t("composer.aiModes.tone"),
    write: t("composer.aiModes.write"),
  }
}

export const useAiToneLabels = (): Record<AiTone, string> => {
  const t = useTranslations()
  return {
    casual: t("composer.aiTones.casual"),
    formal: t("composer.aiTones.formal"),
    friendly: t("composer.aiTones.friendly"),
    inspiring: t("composer.aiTones.inspiring"),
    persuasive: t("composer.aiTones.persuasive"),
    playful: t("composer.aiTones.playful"),
    professional: t("composer.aiTones.professional"),
  }
}

/** The message for an error code the AI call answers with; any other code reads as a generic failure. */
export const useAiErrorMessage = (): ((code: string) => string) => {
  const t = useTranslations()
  const messages: Record<string, string> = {
    aiEmptyOutput: t("composer.aiErrors.provider"),
    aiNeedsReconfiguration: t("composer.aiErrors.needsReconfiguration"),
    aiModelNotChosen: t("composer.aiErrors.modelNotChosen"),
    aiProviderError: t("composer.aiErrors.provider"),
    aiRateLimited: t("composer.aiErrors.rateLimited"),
    aiRequestInProgress: t("composer.aiErrors.inProgress"),
    aiTimeout: t("composer.aiErrors.timeout"),
    workspaceBlocked: t("composer.aiErrors.blocked"),
  }
  const generic = t("composer.aiErrors.generic")
  return (code) => messages[code] ?? generic
}
