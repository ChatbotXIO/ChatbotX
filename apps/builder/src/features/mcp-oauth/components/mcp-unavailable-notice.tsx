"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Shown instead of the connect guide on a host that cannot offer MCP. */
export const McpUnavailableNotice = () => {
  const t = useTranslations("chatbotxMcp.unavailableOnDomain")
  return (
    <Alert>
      <InfoIcon aria-hidden="true" className="size-4" />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>{t("body")}</AlertDescription>
    </Alert>
  )
}
