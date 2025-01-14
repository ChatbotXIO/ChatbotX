"use client"

import { Button } from '@/components/ui/button'
import { T } from "@tolgee/react"
import { ReactNode } from "react"
import { usePathname, redirect } from 'next/navigation';
import { cn } from '@/lib/utils'

interface LayoutSettingProps {
  children: ReactNode
}

const SettingTabs = [
  {
    value: "general",
    label: "settings.tab.general",
    link: 'general'
  },
  {
    value: "channels",
    label: "settings.tab.channels",
    link: 'channels'
  },
  {
    value: "integrations",
    label: "settings.tab.integrations",
    link: 'integrations'
  },
  {
    value: "admins",
    label: "settings.tab.admins",
    link: 'admins'
  },
  {
    value: "billing",
    label: "settings.tab.billing",
    link: 'billing'
  },
]

export default function SettingLayout({ children }: LayoutSettingProps) {
  const pathname = usePathname()

  const hasSelected = (tabKey: string) => pathname.split('/').at(-1) === tabKey

  const onGotoPage = (link: string) => redirect(`${pathname.split('/').slice(0, -1).join('/')}/${link}`)

  return (
    <>
      <section className="grid w-full grid-cols-5">
        {SettingTabs.map((setting) => (
          <Button
            key={setting.value}
            variant='link'
            className={cn(
              'border-b-2 border-gray-200 rounded-none hover:no-underline hover:border-blue-500',
              hasSelected(setting.value) ? 'border-blue-500' : ''
            )}
            onClick={() => onGotoPage(setting.link)}
          >
            <T keyName={setting.label} />
          </Button>
        ))}
      </section>
      <section className="p-4">
        {children}
      </section>
    </>
  )
}
