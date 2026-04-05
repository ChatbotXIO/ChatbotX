"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"

export function AddSequenceButton() {
  const workspaceId = useWorkspaceId()
  const searchParams = useSearchParams()
  const t = useTranslations()

  return (
    <Button asChild size={"sm"}>
      <Link
        href={`/space/${workspaceId}/sequences/create?${searchParams.toString()}`}
      >
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.sequence.label"),
        })}
      </Link>
    </Button>
  )
}
