"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  Box1,
  Convert,
  Cpu,
  DocumentText,
  MessageText1,
  Note,
  People,
  Refresh2,
  SecurityUser,
  Setting4,
  ShieldTick,
  Sms,
  Tag2,
  Warning2,
} from "iconsax-reactjs"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ComponentType } from "react"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

type SettingsItem = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

type SettingsSection = {
  title: string
  items: SettingsItem[]
}

// Rotas onde o sub-sidebar de Configurações deve aparecer.
// Todas as rotas de "Dados Mestres" agora vivem dentro de /settings/* (Camada 2).
const SETTINGS_AREA_PREFIXES = [
  "/settings",
  "/triggers",
  "/webhooks",
  "/tools",
  "/error-logs",
] as const

export function SettingsAreaSidebar() {
  const t = useTranslations()
  const pathname = usePathname()
  const params = useParams()
  const workspaceId = params.workspaceId as string

  if (!workspaceId) {
    return null
  }

  // Só renderiza se o pathname estiver dentro da área de Configurações
  const inSettingsArea = SETTINGS_AREA_PREFIXES.some((prefix) =>
    pathname.startsWith(`/space/${workspaceId}${prefix}`),
  )
  if (!inSettingsArea) {
    return null
  }

  const base = `/space/${workspaceId}`

  const sections: SettingsSection[] = [
    {
      title: t("settingsGroups.general"),
      items: [
        {
          label: t("general.title"),
          href: `${base}/settings/general`,
          icon: wrapIconsax(DocumentText as IconsaxComponent),
        },
      ],
    },
    {
      title: t("settingsGroups.workspace"),
      items: [
        {
          label: t("admins.title"),
          href: `${base}/settings/admins`,
          icon: wrapIconsax(SecurityUser as IconsaxComponent),
        },
        {
          label: t("inboxTeams.title"),
          href: `${base}/settings/inbox-teams`,
          icon: wrapIconsax(People as IconsaxComponent),
        },
      ],
    },
    {
      title: t("settingsGroups.apps"),
      items: [
        {
          label: t("channels.title"),
          href: `${base}/settings/channels`,
          icon: wrapIconsax(Sms as IconsaxComponent),
        },
        {
          label: t("integrations.title"),
          href: `${base}/settings/integrations`,
          icon: wrapIconsax(Box1 as IconsaxComponent),
        },
      ],
    },
    {
      title: t("settingsGroups.inbox"),
      items: [
        {
          label: t("lifecycle.title"),
          href: `${base}/settings/lifecycle`,
          icon: wrapIconsax(Refresh2 as IconsaxComponent),
        },
        {
          label: t("snippets.title"),
          href: `${base}/settings/snippets`,
          icon: wrapIconsax(MessageText1 as IconsaxComponent),
        },
        {
          label: t("closingNotes.title"),
          href: `${base}/settings/closing-notes`,
          icon: wrapIconsax(Note as IconsaxComponent),
        },
      ],
    },
    {
      // Nova seção "Dados" — antes essas 3 viviam como tabs na aba Fluxos
      // (Tags, Campos Personalizados, Logs de Erro). Pedro pediu pra mover
      // pro sub-sidebar de Configurações pra deixar a aba Fluxos focada
      // só em fluxos.
      title: t("settingsGroups.data"),
      items: [
        {
          label: t("tags.title"),
          href: `${base}/settings/tags`,
          icon: wrapIconsax(Tag2 as IconsaxComponent),
        },
        {
          label: t("customFields.title"),
          href: `${base}/settings/contact-fields`,
          icon: wrapIconsax(Note as IconsaxComponent),
        },
        {
          label: t("botFields.title"),
          href: `${base}/settings/bot-fields`,
          icon: wrapIconsax(Cpu as IconsaxComponent),
        },
        {
          label: t("errorLogs.title"),
          href: `${base}/error-logs`,
          icon: wrapIconsax(Warning2 as IconsaxComponent),
        },
      ],
    },
    {
      title: t("settingsGroups.advanced"),
      items: [
        // "Gatilhos" foi removido do menu — agora os gatilhos são o primeiro
        // node de cada flow (TriggerNode no Flow Builder, igual Respond.io).
        // A rota /triggers continua existindo pra não quebrar links antigos,
        // mas sem ponto de entrada visual.
        {
          label: t("webhooks.title"),
          href: `${base}/webhooks`,
          icon: wrapIconsax(Convert as IconsaxComponent),
        },
        {
          label: t("auditLogs.title"),
          href: `${base}/settings/audit-logs`,
          icon: wrapIconsax(ShieldTick as IconsaxComponent),
        },
        {
          label: t("tools.title"),
          href: `${base}/tools`,
          icon: wrapIconsax(Setting4 as IconsaxComponent),
        },
      ],
    },
  ]

  return (
    <aside className="w-[215px] shrink-0 overflow-y-auto border-r bg-sidebar text-sidebar-foreground">
      {/* Header — pt-3 alinha com o AP do sidebar global (que usa pt-2). */}
      <div className="flex items-center px-2 pt-3 pb-2">
        <h2 className="truncate font-semibold text-base">
          {t("settings.title")}
        </h2>
      </div>
      <nav className="flex flex-col gap-3 px-2 py-2">
        {sections.map((section) => (
          <div className="flex flex-col gap-0.5" key={section.title}>
            <span className="px-2 py-1 text-muted-foreground text-sm">
              {section.title}
            </span>
            {section.items.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
