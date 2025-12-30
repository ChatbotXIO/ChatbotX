"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"

export function AddReflinkButton() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  return (
    <Button asChild size={"sm"}>
      <Link href={`/chatbots/${chatbotId}/ref-links/create`}>
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.reflink.label"),
        })}
      </Link>
    </Button>
  )
}
