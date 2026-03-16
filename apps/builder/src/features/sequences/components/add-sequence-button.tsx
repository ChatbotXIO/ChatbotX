"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

export function AddSequenceButton() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const searchParams = useSearchParams()
  const t = useTranslations()

  return (
    <Button asChild size={"sm"}>
      <Link
        href={`/chatbots/${chatbotId}/sequences/create?${searchParams.toString()}`}
      >
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.sequence.label"),
        })}
      </Link>
    </Button>
  )
}
