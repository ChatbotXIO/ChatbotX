import type { ReactNode } from "react"
import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { AllContactsByChannelChart } from "./charts/all-contacts-by-channel-chart"
import { BlockedContactsChart } from "./charts/blocked-contacts-chart"
import { ContactCountsChart } from "./charts/contact-counts-chart"
import { ContactsByChannelChart } from "./charts/contacts-by-channel-chart"
import { ContactsByCountryChart } from "./charts/contacts-by-country-chart"
import { ContactsBySourceChart } from "./charts/contacts-by-source-chart"
import { NewContactCountsChart } from "./charts/new-contact-counts-chart"
import AnalysisFilterForm from "./filter-form"
import InboxStatsList from "./inbox-stats-list"

export function ContactsDashboard({
  defaultSearchParams,
  workspaceCreatedAt,
  nav,
}: {
  defaultSearchParams: { [x: string]: string }
  workspaceCreatedAt?: Date
  /** Optional side navigation, rendered one row below the filter bar. */
  nav?: ReactNode
}) {
  return (
    <AnalysisStoreProvider defaultSearchParams={defaultSearchParams}>
      <AnalysisFilterForm
        defaultPreset="last7"
        workspaceCreatedAt={workspaceCreatedAt}
      />

      <div className="flex gap-6">
        {nav}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <InboxStatsList />

          <div className="grid grid-cols-2 gap-4">
            <ContactCountsChart />
            <NewContactCountsChart />
            <AllContactsByChannelChart />
            <ContactsByChannelChart />
            <ContactsBySourceChart />
            <ContactsByCountryChart />
            <BlockedContactsChart />
          </div>
        </div>
      </div>
    </AnalysisStoreProvider>
  )
}
