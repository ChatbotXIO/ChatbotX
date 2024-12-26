'use client'

import * as React from 'react'
import {
  Atom,
  AudioWaveform, ChartPie,
  Command, GalleryVerticalEnd, MessageCircleMore, Radio, SlidersHorizontal, Users,
  Workflow,
  Wrench
} from 'lucide-react'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { TeamSwitcher } from '@/components/team-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useTranslate } from '@tolgee/react'

export function AppSidebar({ chatbotId, ...props }: React.ComponentProps<typeof Sidebar> & { chatbotId: string }) {
  const { t } = useTranslate()

  const data = {
    user: {
      name: 'shadcn',
      email: 'm@example.com',
      avatar: '/avatars/shadcn.jpg',
    },
    teams: [
      {
        name: 'FREE Business Account',
        logo: GalleryVerticalEnd,
        plan: 'Free',
      },
      {
        name: 'PRO Business Account',
        logo: AudioWaveform,
        plan: 'Profesional',
      },
      {
        name: 'ENTERPRISE Corp.',
        logo: Command,
        plan: 'Enterprise',
      },
    ],
    navMain: [
      {
        title: t('common.analytics'),
        url: `/chatbots/${chatbotId}/dashboard`,
        icon: ChartPie,
        isActive: true,
      },
      {
        title: t('common.inbox'),
        url: `/chatbots/${chatbotId}/inbox`,
        icon: MessageCircleMore,
      },
      {
        title: t('common.flows'),
        url: `/chatbots/${chatbotId}/flows`,
        icon: Workflow,
      },
      {
        title: t('common.contacts'),
        url: `/chatbots/${chatbotId}/contacts`,
        icon: Users,
      },
      {
        title: t('common.automated_responses'),
        url: `/chatbots/${chatbotId}/automated-responses`,
        icon: Atom,
      },
      {
        title: t('common.broadcasts'),
        url: `/chatbots/${chatbotId}/broadcasts`,
        icon: Radio,
      },
      {
        title: t('common.tools'),
        url: `/chatbots/${chatbotId}/tools`,
        icon: Wrench,
      },
      {
        title: t('common.settings'),
        url: `/chatbots/${chatbotId}/settings`,
        icon: SlidersHorizontal,
      },
    ],
  }

  return (
    <Sidebar collapsible='icon' {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
