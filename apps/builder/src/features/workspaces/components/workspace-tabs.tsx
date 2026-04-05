"use client"

import { Tabs, TabsList, TabsTrigger } from "@chatbotx.io/ui/components/ui/tabs"
import Link from "next/link"
import { usePathname } from "next/navigation"

type Tab = {
  value: string
  label: string
  path: string
}

export default function ChatbotTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname()

  const activeTab =
    tabs.find((tab) => pathname.startsWith(tab.path))?.value || tabs[0]?.value

  return (
    <Tabs className="w-full" value={activeTab}>
      <TabsList>
        {tabs.map((tab) => (
          <Link href={tab.path} key={tab.value} passHref>
            <TabsTrigger value={tab.value}>{tab.label}</TabsTrigger>
          </Link>
        ))}
      </TabsList>
    </Tabs>
  )
}
