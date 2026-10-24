"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** The workspace's Mini Apps as picker options, newest first. */
export function useMiniAppOptions(workspaceId?: string) {
  const routeWorkspaceId = useWorkspaceId()
  const { data } = useQuery(
    orpc.miniAppsAPI.listMiniAppOptionsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? routeWorkspaceId },
    }),
  )
  return useMemo(
    () =>
      (data ?? []).map((miniApp) => ({
        label: miniApp.name,
        value: miniApp.id,
      })),
    [data],
  )
}

/** Picks one of the workspace's Mini Apps into the form field `name`. */
export function MiniAppSelect({
  name,
  workspaceId,
}: {
  name: string
  workspaceId?: string
}) {
  const t = useTranslations()
  const options = useMiniAppOptions(workspaceId)

  return (
    <ComboboxField
      emptyText={t("actions.noRecordFound")}
      label={t("fields.miniApp.label")}
      name={name}
      options={options}
      placeholder={t("actions.pleaseSelect")}
      required
    />
  )
}
