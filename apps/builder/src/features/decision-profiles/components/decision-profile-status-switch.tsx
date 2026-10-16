"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { toggleDecisionProfileAction } from "../actions/toggle-decision-profile.action"
import { useInvalidateDecisionProfiles } from "../hooks/use-decision-profiles"
import type { DecisionProfileListItem } from "../schema/resource"

type Props = {
  profile: DecisionProfileListItem
  workspaceId: string
}

export function DecisionProfileStatusSwitch({ profile, workspaceId }: Props) {
  const router = useRouter()
  const invalidateDecisionProfiles = useInvalidateDecisionProfiles()
  const t = useTranslations()
  const { execute, isPending } = useAction(
    toggleDecisionProfileAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: () => {
        invalidateDecisionProfiles()
        router.refresh()
      },
    },
  )

  return (
    <Switch
      aria-label={t("fields.enabled.label")}
      checked={profile.status === "enabled"}
      disabled={isPending}
      onCheckedChange={(enabled) => execute({ enabled, id: profile.id })}
    />
  )
}
