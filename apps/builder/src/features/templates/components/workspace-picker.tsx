"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { installTemplateAction } from "../actions/install-template.action"

type WorkspaceOption = {
  id: string
  name: string
}

type WorkspacePickerProps = {
  shareToken: string
  workspaces: WorkspaceOption[]
}

/**
 * The install action returns only `{installationId}` — it never means the
 * install already finished — so on success this only toasts "started" and
 * routes to the installs status page, never "installed".
 */
export function WorkspacePicker({
  shareToken,
  workspaces,
}: WorkspacePickerProps) {
  const t = useTranslations("templatesPublicPage")
  const router = useRouter()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    workspaces[0]?.id,
  )
  const options = useMemo(
    () =>
      workspaces.map((workspace) => ({
        label: workspace.name,
        value: workspace.id,
      })),
    [workspaces],
  )

  const { execute, isPending } = useAction(
    installTemplateAction.bind(null, selectedWorkspaceId ?? ""),
    {
      onSuccess: () => {
        toast.success(t("installStarted"))
        if (selectedWorkspaceId) {
          router.push(`/space/${selectedWorkspaceId}/templates/installs`)
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  if (workspaces.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("noEligibleWorkspaces")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        items={options}
        onValueChange={(value) => {
          if (typeof value === "string") {
            setSelectedWorkspaceId(value)
          }
        }}
        value={selectedWorkspaceId}
      >
        <SelectTrigger className="sm:w-64">
          <SelectValue placeholder={t("selectWorkspace")} />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={!selectedWorkspaceId || isPending}
        onClick={() => execute({ shareToken })}
      >
        {isPending && <Loader2 className="animate-spin" />}
        {t("install")}
      </Button>
    </div>
  )
}
