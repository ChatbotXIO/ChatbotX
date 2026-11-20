"use client"

import type { MultiSelectLabels } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useTranslations } from "next-intl"

/** The store dialogs' multi-select wording; `optionsLabel` names what is picked (categories, languages). */
export function useMultiSelectLabels(optionsLabel: string): MultiSelectLabels {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const tMessages = useTranslations("messages")
  return {
    searchPlaceholder: tActions("search"),
    searchAriaLabel: tActions("search"),
    optionsAriaLabel: optionsLabel,
    empty: tMessages("noResults"),
    clear: tActions("clear"),
    clearAllAriaLabel: () => tActions("clear"),
    removeAriaLabel: (name) => t("removeChip", { name }),
    close: t("close"),
    selectAll: () => tActions("selectAll"),
  }
}
