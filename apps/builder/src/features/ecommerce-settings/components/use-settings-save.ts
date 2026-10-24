"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { updateEcommerceSettingsAction } from "../actions/update-ecommerce-settings.action"

/** Saves one settings group and refreshes the page on success. */
export function useSettingsSave(workspaceId: string) {
  const t = useTranslations("ecommerceSettings")
  const router = useRouter()
  return useAction(updateEcommerceSettingsAction.bind(null, workspaceId), {
    onSuccess: () => {
      toast.success(t("saved"))
      router.refresh()
    },
    onError: toastActionError(t("saveError")),
  })
}
