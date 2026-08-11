import { SMART_RESPONSE_DELAY_OPTIONS } from "@chatbotx.io/database/partials"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { useTranslations } from "next-intl"
import { useTenantSettings } from "@/features/tenant"
import type { WorkspaceResource } from "./schema/resource"
import { SMART_RESPONSE_DELAY_NONE_VALUE } from "./schema/update-workspace-schema"

export function useWorkspaceLogoUrl(
  workspace: Pick<WorkspaceResource, "logo"> | null | undefined,
): string | undefined {
  const { storageUrl } = useTenantSettings()

  return getWorkspaceLogoUrl(workspace, storageUrl)
}

export function getWorkspaceLogoUrl(
  workspace: Pick<WorkspaceResource, "logo"> | null | undefined,
  storageUrl: string,
): string | undefined {
  return workspace?.logo
    ? getPublicFileUrl(workspace.logo, storageUrl)
    : undefined
}

export function formatScheduleTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":")
  const hour = Number(hourStr)
  return minuteStr && minuteStr !== "00" ? `${hour}:${minuteStr}` : String(hour)
}

export function getSmartResponseDelayOptionLabel(
  delaySeconds: number,
  t: ReturnType<typeof useTranslations>,
): string {
  if (delaySeconds < 60) {
    return t("fields.smartResponseDelaySeconds.seconds", {
      count: delaySeconds,
    })
  }

  return t("fields.smartResponseDelaySeconds.minutes", {
    count: delaySeconds / 60,
  })
}

export function getSmartResponseDelaySelectOptions(
  t: ReturnType<typeof useTranslations>,
): { value: string; label: string }[] {
  return [
    {
      value: SMART_RESPONSE_DELAY_NONE_VALUE,
      label: t("messages.none"),
    },
    ...SMART_RESPONSE_DELAY_OPTIONS.map((delaySeconds) => ({
      value: String(delaySeconds),
      label: getSmartResponseDelayOptionLabel(delaySeconds, t),
    })),
  ]
}
