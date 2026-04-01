"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useChatbotId } from "@/hooks/routing"

export function AddAutomatedResponseButton() {
  const chatbotId = useChatbotId()

  const searchParams = useSearchParams()
  const t = useTranslations()

  return (
    <Button asChild size={"sm"}>
      <Link
        href={`/chatbots/${chatbotId}/automated-responses/create?${searchParams.toString()}`}
      >
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.automatedResponse.label"),
        })}
      </Link>
    </Button>
  )
}
