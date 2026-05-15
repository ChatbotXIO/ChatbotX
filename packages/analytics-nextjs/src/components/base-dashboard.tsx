import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { AdminsAnalysis } from "./charts/admins-analysis"
import { AllContactsByChannelChart } from "./charts/all-contacts-by-channel-chart"
import { ArchivedConversationChart } from "./charts/archived-conversation-chart"
import { AssignedConversationsByAdminChart } from "./charts/assigned-conversations-by-admin-chart"
import { AssignedConversationsChart } from "./charts/assigned-conversations-chart"
import { BlockedContactsChart } from "./charts/blocked-contacts-chart"
import { BotMessagesByResultChart } from "./charts/bot-messages-by-result-chart"
import { ContactCountsChart } from "./charts/contact-counts-chart"
import { ContactsByChannelChart } from "./charts/contacts-by-channel-chart"
import { ContactsByCountryChart } from "./charts/contacts-by-country-chart"
import { ContactsBySourceChart } from "./charts/contacts-by-source-chart"
import { ConversationsMovedChart } from "./charts/conversations-moved-chart"
import { FollowUpConversations } from "./charts/follow-up-conversations"
import { MessagesBySenderChart } from "./charts/messages-by-sender-chart"
import { MessagesSentByAdminsChart } from "./charts/messages-sent-by-admins-chart"
import { NewContactCountsChart } from "./charts/new-contact-counts-chart"
import { UniqueConversationsByAdminChart } from "./charts/unique-conversations-by-admin-chart"
import AnalysisFilterForm from "./filter-form"
import InboxStatsList from "./inbox-stats-list"

export function BaseDashboard({
  defaultSearchParams,
  workspaceCreatedAt,
}: {
  defaultSearchParams: { [x: string]: string }
  workspaceCreatedAt?: Date
}) {
  return (
    <AnalysisStoreProvider defaultSearchParams={defaultSearchParams}>
      <AnalysisFilterForm
        defaultPreset="last7"
        workspaceCreatedAt={workspaceCreatedAt}
      />
      <InboxStatsList />

      <div className="grid grid-cols-2 gap-4">
        <ContactCountsChart />
        <NewContactCountsChart />
        <AllContactsByChannelChart />
        <ContactsByChannelChart />
        <ContactsBySourceChart />
        <ContactsByCountryChart />
        <BlockedContactsChart />
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
    </AnalysisStoreProvider>
  )
}
