"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { ChartColumnIcon, MailIcon, UserRoundIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { buildTabSearchParams, type MarketingMessagesTab } from "../lib/tab"

export function MarketingMessagesTabs({
  tab,
  campaigns,
  audiences,
  statistics,
}: {
  tab: MarketingMessagesTab
  campaigns: ReactNode
  audiences: ReactNode
  statistics: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onValueChange = (value: unknown) => {
    const params = buildTabSearchParams(searchParams.toString(), value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <Tabs className="gap-4" onValueChange={onValueChange} value={tab}>
      <TabsList className="w-full">
        <TabsTrigger value="campaigns">
          <MailIcon className="size-4" />
          {t("facebookMarketingMessages.tabs.campaigns")}
        </TabsTrigger>
        <TabsTrigger value="audiences">
          <UserRoundIcon className="size-4" />
          {t("facebookMarketingMessages.tabs.audiences")}
        </TabsTrigger>
        <TabsTrigger value="statistics">
          <ChartColumnIcon className="size-4" />
          {t("facebookMarketingMessages.tabs.statistics")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns">{campaigns}</TabsContent>
      <TabsContent value="audiences">{audiences}</TabsContent>
      <TabsContent value="statistics">{statistics}</TabsContent>
    </Tabs>
  )
}
