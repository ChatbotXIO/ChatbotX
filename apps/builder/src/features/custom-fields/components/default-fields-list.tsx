"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  AtSignIcon,
  GlobeIcon,
  ImageIcon,
  LanguagesIcon,
  LockIcon,
  type LucideIcon,
  PhoneIcon,
  TextIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

type DefaultField = {
  fieldId: string
  labelKey: string
  type: string
  icon: LucideIcon
}

// 7 campos padrão do contato — não podem ser editados/deletados (vêm do
// schema do contato, sao imutáveis). Paridade Respond.io (gap #11 —
// 2026-05-27): renderizar fixos no topo da tabela /settings/contact-fields
// pra usuário saber que existem e qual o slug (pra usar em APIs/templates).
const DEFAULT_FIELDS: DefaultField[] = [
  {
    fieldId: "firstName",
    labelKey: "fields.firstName.label",
    type: "shortText",
    icon: TextIcon,
  },
  {
    fieldId: "lastName",
    labelKey: "fields.lastName.label",
    type: "shortText",
    icon: TextIcon,
  },
  {
    fieldId: "phoneNumber",
    labelKey: "fields.phoneNumber.label",
    type: "phoneNumber",
    icon: PhoneIcon,
  },
  {
    fieldId: "email",
    labelKey: "fields.email.label",
    type: "email",
    icon: AtSignIcon,
  },
  {
    fieldId: "country",
    labelKey: "fields.country.label",
    type: "shortText",
    icon: GlobeIcon,
  },
  {
    fieldId: "locale",
    labelKey: "fields.locale.label",
    type: "shortText",
    icon: LanguagesIcon,
  },
  {
    fieldId: "avatar",
    labelKey: "fields.avatar.label",
    type: "url",
    icon: ImageIcon,
  },
]

const TYPE_LABEL: Record<string, string> = {
  shortText: "fields.shortText.label",
  phoneNumber: "fields.phoneNumber.label",
  email: "fields.email.label",
  url: "fields.url.label",
}

export function DefaultFieldsList() {
  const t = useTranslations()

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-sm text-text-secondary">
          {t("customFields.defaultsTitle")}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <LockIcon aria-hidden className="size-3 text-text-tertiary" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-xs">
              {t("customFields.defaultsTooltip")}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="overflow-hidden rounded-md border border-white/[0.08] border-dashed">
        {DEFAULT_FIELDS.map((field, idx) => {
          const Icon = field.icon
          return (
            <div
              className={cn(
                "flex items-center gap-3 bg-white/[0.02] px-4 py-2 text-sm",
                idx !== DEFAULT_FIELDS.length - 1 &&
                  "border-white/[0.06] border-b",
              )}
              key={field.fieldId}
            >
              <Icon
                aria-hidden
                className="size-4 shrink-0 text-text-tertiary"
              />
              <div className="min-w-0 flex-1">
                <span className="text-foreground">{t(field.labelKey)}</span>
              </div>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                {field.fieldId}
              </code>
              <span className="hidden text-muted-foreground text-xs sm:inline">
                {t(TYPE_LABEL[field.type] ?? "fields.shortText.label")}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <LockIcon
                    aria-hidden
                    className="size-3 shrink-0 text-text-tertiary"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {t("customFields.defaultsLockTooltip")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>
    </section>
  )
}
