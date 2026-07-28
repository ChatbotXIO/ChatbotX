"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { useTranslations } from "next-intl"
import { TopicList } from "./topic-list"

type TopicCouponContentProps = {
  workspaceId: string
}

export function TopicCouponContent({ workspaceId }: TopicCouponContentProps) {
  const t = useTranslations()

  return (
    <Tabs className="space-y-4" defaultValue="active">
      <TabsList className="w-full">
        <TabsTrigger value="active">{t("coupons.tabs.listTopic")}</TabsTrigger>
        <TabsTrigger value="archive">{t("coupons.tabs.archive")}</TabsTrigger>
      </TabsList>
      <TabsContent className="pt-4" value="active">
        <TopicList archived={false} workspaceId={workspaceId} />
      </TabsContent>
      <TabsContent className="pt-4" value="archive">
        <TopicList archived workspaceId={workspaceId} />
      </TabsContent>
    </Tabs>
  )
}
