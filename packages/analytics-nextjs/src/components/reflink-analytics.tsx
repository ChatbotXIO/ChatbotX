import type { AnalysisStoreProviderProps } from "../provider/analysis-store-context"
import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { ReflinkContactsTable } from "./charts/reflink-contacts-table"
import { ReflinkStatsChart } from "./charts/reflink-stats-chart"
import { ReflinkStatsTable } from "./charts/reflink-stats-table"
import AnalysisFilterForm from "./filter-form"

export function ReflinkAnalytics({
  defaultSearchParams,
}: {
  defaultSearchParams: AnalysisStoreProviderProps["defaultSearchParams"]
}) {
  return (
    <AnalysisStoreProvider
      defaultSearchParams={defaultSearchParams}
      type="reflinks"
    >
      <AnalysisFilterForm defaultPreset="last7" />

      <div className="flex flex-col gap-6">
        <ReflinkStatsChart />
        <ReflinkStatsTable />
        <ReflinkContactsTable />
      </div>
    </AnalysisStoreProvider>
  )
}
