import type { ReactNode } from "react"
import type { AnalysisStoreProviderProps } from "../provider/analysis-store-context"
import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { AllContactsByChannelChart } from "./charts/all-contacts-by-channel-chart"
import { BlockedContactsChart } from "./charts/blocked-contacts-chart"
import { ContactCountsChart } from "./charts/contact-counts-chart"
import { ContactsByChannelChart } from "./charts/contacts-by-channel-chart"
import { ContactsByCountryChart } from "./charts/contacts-by-country-chart"
import { ContactsBySourceChart } from "./charts/contacts-by-source-chart"
import { NewContactCountsChart } from "./charts/new-contact-counts-chart"
import { DashboardPanel } from "./dashboard-panel"
import AnalysisFilterForm from "./filter-form"
import InboxStatsList from "./inbox-stats-list"

export function ContactsDashboard({
  defaultSearchParams,
  workspaceCreatedAt,
  nav,
}: {
  defaultSearchParams: AnalysisStoreProviderProps["defaultSearchParams"]
  workspaceCreatedAt?: Date
  /** Optional side navigation, rendered one row below the filter bar. */
  nav?: ReactNode
}) {
  return (
    <AnalysisStoreProvider
      defaultSearchParams={defaultSearchParams}
      type="contacts"
    >
      <AnalysisFilterForm
        defaultPreset="last7"
        workspaceCreatedAt={workspaceCreatedAt}
      />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        {nav}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <InboxStatsList />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DashboardPanel action="getContactCounts">
              <ContactCountsChart />
            </DashboardPanel>
            <DashboardPanel action="getNewContactCounts">
              <NewContactCountsChart />
            </DashboardPanel>
            <DashboardPanel action="getContactsByChannel">
              <AllContactsByChannelChart />
            </DashboardPanel>
            <DashboardPanel action="getContactsByChannel">
              <ContactsByChannelChart />
            </DashboardPanel>
            <DashboardPanel action="getContactsBySource">
              <ContactsBySourceChart />
            </DashboardPanel>
            <DashboardPanel action="getContactsByCountry">
              <ContactsByCountryChart />
            </DashboardPanel>
            <DashboardPanel action="getBlockedContactCounts">
              <BlockedContactsChart />
            </DashboardPanel>
          </div>
        </div>
      </div>
    </AnalysisStoreProvider>
  )
}
