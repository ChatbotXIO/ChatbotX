"use client"

import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Controller, useFormContext } from "react-hook-form"

export function AdvancedRestrictions({
  role,
}: {
  role: "owner" | "manager" | "agent"
}) {
  const t = useTranslations("admins")
  const [open, setOpen] = useState(false)

  if (role === "owner") {
    return null
  }

  return (
    <Collapsible className="space-y-3" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center justify-between text-primary text-sm hover:underline"
          type="button"
        >
          <span>{t("advancedRestrictions")}</span>
          <ChevronDownIcon
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 pt-2">
        {role === "manager" && <ManagerRestrictions />}
        {role === "agent" && <AgentRestrictions />}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CheckboxRestriction({
  name,
  label,
  description,
}: {
  name: string
  label: string
  description: string
}) {
  return (
    <Controller
      name={name}
      render={({ field }) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox shadcn renderiza input filho — label envolve corretamente
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={Boolean(field.value)}
            className="mt-0.5 shrink-0"
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          <div className="flex-1 space-y-0.5">
            <div className="font-medium text-sm">{label}</div>
            <p className="text-text-secondary text-xs leading-relaxed">
              {description}
            </p>
          </div>
        </label>
      )}
    />
  )
}

function ManagerRestrictions() {
  const t = useTranslations("admins.managerRestrictions")
  const keys = [
    "restrictDataExport",
    "restrictContactDeletion",
    "restrictWorkspaceSettings",
    "restrictIntegrationSettings",
  ] as const
  return (
    <>
      {keys.map((key) => (
        <CheckboxRestriction
          description={t(`${key}.description`)}
          key={key}
          label={t(`${key}.label`)}
          name={`permissions.${key}`}
        />
      ))}
    </>
  )
}

function AgentRestrictions() {
  const t = useTranslations("admins.agentRestrictions")
  const tOpt = useTranslations(
    "admins.agentRestrictions.contactVisibility.options",
  )
  const { control } = useFormContext()

  return (
    <>
      <Controller
        control={control}
        name="permissions.contactVisibility"
        render={({ field }) => {
          const checked = field.value && field.value !== "all"
          return (
            <div className="flex items-start gap-3">
              <Checkbox
                checked={Boolean(checked)}
                className="mt-0.5 shrink-0"
                onCheckedChange={(c) =>
                  field.onChange(c === true ? "self" : "all")
                }
              />
              <div className="flex flex-1 items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-medium text-sm">
                    {t("contactVisibility.label")}
                  </div>
                  <p className="text-text-secondary text-xs leading-relaxed">
                    {t("contactVisibility.description")}
                  </p>
                </div>
                {checked && (
                  <Select
                    onValueChange={(v) => field.onChange(v)}
                    value={field.value}
                  >
                    <SelectTrigger className="w-[220px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team">{tOpt("team")}</SelectItem>
                      <SelectItem value="self">{tOpt("self")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )
        }}
      />
      <CheckboxRestriction
        description={t("restrictCalling.description")}
        label={t("restrictCalling.label")}
        name="permissions.restrictCalling"
      />
      <CheckboxRestriction
        description={t("restrictWorkflows.description")}
        label={t("restrictWorkflows.label")}
        name="permissions.restrictWorkflows"
      />
      <CheckboxRestriction
        description={t("maskPhoneAndEmail.description")}
        label={t("maskPhoneAndEmail.label")}
        name="permissions.maskPhoneAndEmail"
      />
    </>
  )
}
