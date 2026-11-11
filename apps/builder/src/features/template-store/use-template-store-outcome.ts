"use client"

import {
  TEMPLATE_STORE_MAX_CATEGORIES,
  TEMPLATE_STORE_MAX_LISTINGS,
} from "@chatbotx.io/database/partials"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { TemplateStoreOutcome, TemplateStoreRejection } from "./schema"

const REJECTION_MESSAGE_KEY = {
  templateUnavailable: "templateStore.errors.templateUnavailable",
  listingExists: "templateStore.errors.listingExists",
  listingUnavailable: "templateStore.errors.listingUnavailable",
  listingLimit: "templateStore.errors.listingLimit",
  categoryUnavailable: "templateStore.errors.categoryUnavailable",
  categoryNameTaken: "templateStore.errors.categoryNameTaken",
  categoryLimit: "templateStore.errors.categoryLimit",
} as const satisfies Record<TemplateStoreRejection, string>

/**
 * Turns a store action's outcome into UI: a success toast and a refresh of the
 * server-rendered tables, or the reason it was refused. A refusal also
 * refreshes, since it usually means the screen was out of date (a category
 * deleted in another tab).
 */
export function useTemplateStoreOutcome() {
  const t = useTranslations()
  const router = useRouter()

  return (
    outcome: TemplateStoreOutcome | undefined,
    options: { successMessage: string; onDone?: () => void },
  ) => {
    if (outcome?.status === "rejected") {
      toast.error(
        t(REJECTION_MESSAGE_KEY[outcome.reason], {
          templateLimit: TEMPLATE_STORE_MAX_LISTINGS,
          categoryLimit: TEMPLATE_STORE_MAX_CATEGORIES,
        }),
      )
      router.refresh()
      return
    }
    toast.success(options.successMessage)
    options.onDone?.()
    router.refresh()
  }
}
