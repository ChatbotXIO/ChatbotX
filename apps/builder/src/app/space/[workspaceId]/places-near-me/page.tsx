import {
  placeCategoryService,
  placeLocationService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CategoriesTable } from "@/features/places-near-me/components/categories-table"
import { LocationsTable } from "@/features/places-near-me/components/locations-table"
import { PlacesNearMeView } from "@/features/places-near-me/components/places-near-me-view"
import { parsePlacesNearMeTab } from "@/features/places-near-me/lib/tab"
import { listPlaceLocationsSearchParams } from "@/features/places-near-me/schema/query"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function PlacesNearMePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const access = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!access) {
    return notFound()
  }

  const rawSearch = await searchParams
  const tab = parsePlacesNearMeTab(rawSearch.tab)
  const t = await getTranslations()

  // Fetch only the active tab's data. Locations also need the categories
  // for the form dropdown.
  const categories = await placeCategoryService.list(workspaceId)
  const locations =
    tab === "locations"
      ? await placeLocationService.list({
          workspaceId,
          ...pickLocationSearch(rawSearch),
        })
      : null

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("placesNearMe.title"), href: "" },
        ]}
      />
      <Suspense>
        <PlacesNearMeView
          categories={
            <CategoriesTable
              categories={categories}
              workspaceId={workspaceId}
            />
          }
          locations={
            locations ? (
              <LocationsTable
                categories={categories}
                locations={locations}
                workspaceId={workspaceId}
              />
            ) : null
          }
          tab={tab}
        />
      </Suspense>
    </div>
  )
}

function pickLocationSearch(
  raw: Record<string, string | string[] | undefined>,
) {
  const search = listPlaceLocationsSearchParams.parse(raw)
  return {
    name: search.name ?? undefined,
    page: Math.max(1, search.page),
    // Same 1-50 cap as the public API.
    perPage: Math.min(50, Math.max(1, search.perPage)),
  }
}
