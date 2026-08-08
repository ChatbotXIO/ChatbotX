"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"

type AddAutomatedResponseButtonProps = {
  basePath: string
}

export function AddAutomatedResponseButton({
  basePath,
}: AddAutomatedResponseButtonProps) {
  const workspaceId = useWorkspaceId()

  const searchParams = useSearchParams()
  const t = useTranslations()

  return (
    <Link
      className={buttonVariants({ size: "sm" })}
      href={`/space/${workspaceId}/${basePath}/create?${searchParams.toString()}`}
    >
      <PlusIcon />
      {t("actions.createFeature", {
        feature: t("fields.automatedResponse.label"),
      })}
    </Link>
  )
}
