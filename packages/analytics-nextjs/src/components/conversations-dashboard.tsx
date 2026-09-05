import type { ReactNode } from "react"
import type { AnalysisStoreProviderProps } from "../provider/analysis-store-context"
import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { AdminsAnalysis } from "./charts/admins-analysis"
import { ArchivedConversationChart } from "./charts/archived-conversation-chart"
import { AssignedConversationsByAdminChart } from "./charts/assigned-conversations-by-admin-chart"
import { AssignedConversationsChart } from "./charts/assigned-conversations-chart"
import { BotMessagesByResultChart } from "./charts/bot-messages-by-result-chart"
import { ConversationsMovedChart } from "./charts/conversations-moved-chart"
import { FollowUpConversations } from "./charts/follow-up-conversations"
import { MessagesBySenderChart } from "./charts/messages-by-sender-chart"
import { MessagesSentByAdminsChart } from "./charts/messages-sent-by-admins-chart"
import { UniqueConversationsByAdminChart } from "./charts/unique-conversations-by-admin-chart"
import AnalysisFilterForm from "./filter-form"

export function ConversationsDashboard({
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
    <AnalysisStoreProvider defaultSearchParams={defaultSearchParams}>
      <AnalysisFilterForm
        defaultPreset="last7"
        workspaceCreatedAt={workspaceCreatedAt}
      />

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        {nav}
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          {/* <AvgResponseMinutesChart /> */}
          {/* <AvgFirstResponseMinutesByAdminChart /> */}
          {/* <AvgResponseMinutesByAdminChart /> */}
          {/* <AvgConversationDurationChart /> */}
          <BotMessagesByResultChart />
          <MessagesBySenderChart />
          <ConversationsMovedChart />
          <AdminsAnalysis />
          <UniqueConversationsByAdminChart />
          <MessagesSentByAdminsChart />
          <AssignedConversationsByAdminChart />
          <AssignedConversationsChart />
          <FollowUpConversations />
          <ArchivedConversationChart />
        </div>
      </div>
    </AnalysisStoreProvider>
  )
}
