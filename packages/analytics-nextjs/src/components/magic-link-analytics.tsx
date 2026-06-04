import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { MagicLinkContactsTable } from "./charts/magic-link-contacts-table"
import { MagicLinkStatsChart } from "./charts/magic-link-stats-chart"
import { MagicLinkStatsTable } from "./charts/magic-link-stats-table"
import AnalysisFilterForm from "./filter-form"

export function MagicLinkAnalytics({
  defaultSearchParams,
}: {
  defaultSearchParams: { [x: string]: string }
}) {
  return (
    <AnalysisStoreProvider
      defaultSearchParams={defaultSearchParams}
      type="magic-links"
    >
      <AnalysisFilterForm defaultPreset="last7" />

      <div className="flex flex-col gap-6">
        <MagicLinkStatsChart />
        <MagicLinkStatsTable />
        <MagicLinkContactsTable />
      </div>
    </AnalysisStoreProvider>
  )
}
