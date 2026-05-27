"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  Brodcast,
  DirectInbox,
  Element2,
  Setting2,
  UserSquare,
} from "iconsax-reactjs"

import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { BrandIcon } from "@/components/brand-icon"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { RespondAIAgentIcon, RespondFlowIcon } from "@/components/respond-icons"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { authClient } from "@/lib/auth/auth-client"

export function AppSidebar({
  workspaceId,
  allWorkspaces,
  organization,
  ...props
}: ComponentProps<typeof Sidebar> & {
  workspaceId: string
  allWorkspaces: WorkspaceResource[]
  organization?: { id: string; name: string } | null
}) {
  const t = useTranslations()
  const { data: session } = authClient.useSession()

  const data = {
    user: {
      name: session?.user.name ?? "",
      email: session?.user.email ?? "",
      avatar: session?.user.image ?? "",
    },
    // Ordem definida pelo Pedro 2026-05-26:
    // Análises → Inbox → Contatos → Agentes de IA → Transmissão → Fluxos →
    // Configurações.
    navMain: [
      {
        title: t("fields.analytics.label"),
        url: `/space/${workspaceId}/dashboard`,
        // Equivale ao `icon-element-2` (Dashboard no Respond.io)
        icon: wrapIconsax(Element2 as IconsaxComponent),
      },
      {
        title: t("fields.inbox.label"),
        url: `/space/${workspaceId}/inbox`,
        // Equivale ao `icon-direct-inbox` (Inbox no Respond.io)
        icon: wrapIconsax(DirectInbox as IconsaxComponent),
      },
      {
        title: t("fields.contacts.label"),
        url: `/space/${workspaceId}/contacts`,
        icon: wrapIconsax(UserSquare as IconsaxComponent),
      },
      {
        title: t("aiAgent.title"),
        url: `/space/${workspaceId}/ai-agents`,
        // AI Agent — robô do Respond.io extraído da fonte deles (pixel-perfect).
        // Substitui o CpuCharge da Iconsax.
        icon: RespondAIAgentIcon,
      },
      {
        title: t("automation.title"),
        url: `/space/${workspaceId}/automated-responses`,
        // Equivale ao `icon-custom-broadcast` (Broadcast/Automação).
        // Usamos `Brodcast` (sic — nome real na lib).
        icon: wrapIconsax(Brodcast as IconsaxComponent),
      },
      {
        title: t("fields.flows.label"),
        url: `/space/${workspaceId}/flows`,
        // Flow — ícone do Respond.io extraído da fonte deles (pixel-perfect).
        // Substitui o Hierarchy3 da Iconsax que era só aproximação visual.
        icon: RespondFlowIcon,
      },
      {
        title: t("settings.title"),
        url: `/space/${workspaceId}/settings/general`,
        // Equivale ao `icon-settings`. Usamos `Setting2` da Iconsax.
        icon: wrapIconsax(Setting2 as IconsaxComponent),
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Header — só o WorkspaceSwitcher. pt-2 (8px) pra subir o AP e
          alinhar o centro dele com o título do sub-sidebar (Caixa de Entrada).
          Antes era pt-4 (16px) e o AP ficava 12px abaixo do título do sub. */}
      <SidebarHeader className="gap-0 px-0 pt-2 pb-0">
        <div className="px-1">
          <WorkspaceSwitcher
            organization={organization ?? undefined}
            workspaces={allWorkspaces}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      {/* Footer — NavUser + BrandIcon (embaixo, com link pra "/").
          Container do logo um pouco maior (h-12) pra acomodar o ícone de 32px
          com respiro. */}
      <SidebarFooter>
        <NavUser user={data.user} />
        <Link
          aria-label="Marca"
          className="flex h-12 items-center justify-center"
          href="/"
        >
          <BrandIcon alt="Marca" />
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}
