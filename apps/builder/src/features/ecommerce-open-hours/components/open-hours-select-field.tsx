"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { OpenHoursDialog } from "./open-hours-dialog"

/** The select's value for "always open"; the forms map it to null. */
export const ALWAYS_OPEN = "always"

/**
 * "Always open" or one of the workspace's named schedules, with an
 * "Add New" link that creates a schedule and selects it.
 */
export function OpenHoursSelectField({
  workspaceId,
  name,
  label,
  schedules,
  disabled,
}: {
  workspaceId: string
  name: string
  label?: string
  schedules: Array<{ id: string; name: string }>
  disabled?: boolean
}) {
  const t = useTranslations("openHours")
  const router = useRouter()
  const { setValue } = useFormContext()
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-1">
      <SelectField
        disabled={disabled}
        label={label}
        name={name}
        options={[
          { value: ALWAYS_OPEN, label: t("alwaysOpen") },
          ...schedules.map((schedule) => ({
            value: schedule.id,
            label: schedule.name,
          })),
        ]}
      />
      <Button
        className="h-auto p-0"
        disabled={disabled}
        onClick={() => setCreating(true)}
        type="button"
        variant="link"
      >
        {t("addNew")}
      </Button>
      <OpenHoursDialog
        onCreated={(openHoursId) => {
          router.refresh()
          setValue(name, openHoursId, { shouldDirty: true })
        }}
        onOpenChange={setCreating}
        open={creating}
        workspaceId={workspaceId}
      />
    </div>
  )
}
