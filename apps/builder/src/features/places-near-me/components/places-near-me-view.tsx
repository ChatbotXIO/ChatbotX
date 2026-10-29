"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { MapPinIcon, TagsIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { buildTabSearchParams, type PlacesNearMeTab } from "../lib/tab"

export type PlacesNearMeViewProps = {
  tab: PlacesNearMeTab
  /** Locations tab content (Task 9 supplies the table). */
  locations: ReactNode
  /** Categories tab content (Task 8 supplies the table). */
  categories: ReactNode
}

export function PlacesNearMeView({
  tab,
  locations,
  categories,
}: PlacesNearMeViewProps) {
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
        <TabsTrigger value="locations">
          <MapPinIcon className="size-4" />
          {t("placesNearMe.tabs.locations")}
        </TabsTrigger>
        <TabsTrigger value="categories">
          <TagsIcon className="size-4" />
          {t("placesNearMe.tabs.categories")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="locations">{locations}</TabsContent>
      <TabsContent value="categories">{categories}</TabsContent>
    </Tabs>
  )
}
