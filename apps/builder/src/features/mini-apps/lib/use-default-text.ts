"use client"

import type { MiniAppDefaultText } from "@chatbotx.io/mini-app"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { defaultTextKey } from "./labels"

/** The translated texts a new component starts with. */
export function useDefaultText(): MiniAppDefaultText {
  const t = useTranslations()
  return useCallback((key) => t(defaultTextKey[key]), [t])
}
