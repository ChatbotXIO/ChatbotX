import { getTranslations } from "next-intl/server"
import BarChart from "@/components/charts/bar-chart"
import { DonutChart } from "@/components/charts/donut-chart"
import { RadarChart } from "@/components/charts/radar-chart"
import AnalysisFilterForm from "@/features/analysis/filter-form"
import { AnalysisStoreProvider } from "@/features/analysis/provider/analysis-store-context"
import { BotMessagesByResultChart } from "@/features/analytics/components/bot-messages-by-result-chart"
import { ContactsByChannelChart } from "@/features/analytics/components/contacts-by-channel-chart"
import { ContactsByCountryChart } from "@/features/analytics/components/contacts-by-country-chart"
import { ContactsBySourceChart } from "@/features/analytics/components/contacts-by-source-chart"
import { ConversationsMovedChart } from "@/features/analytics/components/conversations-moved-chart"
import { MessagesBySenderChart } from "@/features/analytics/components/messages-by-sender-chart"
import { NewContactsChart } from "@/features/analytics/components/new-contacts-chart"
import { TotalContactsChart } from "@/features/analytics/components/total-contacts-chart"
import { ChatbotMemberAnalysis } from "@/features/chatbot-members/components/admins-analysis"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import InboxStatsList from "@/features/inboxes/components/inbox-stats-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const t = await getTranslations()
  const { chatbotId } = await params

  const { data: inboxes } = await listInboxes({
    chatbotId,
    includes: ["integration"],
  })

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList chatbotId={chatbotId} inboxes={inboxes} />

      <AnalysisStoreProvider chatbotId={chatbotId}>
        <AnalysisFilterForm />
        <InboxStatsList />

        <div className="grid grid-cols-2 gap-4">
          <TotalContactsChart chatbotId={chatbotId} />
          <NewContactsChart chatbotId={chatbotId} />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: t("analytics.firstResponseTime"),
                    value: 4000,
                  },
                  {
                    label: t("analytics.responseTime"),
                    value: 2400,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: t("analytics.firstResponseTime"),
                    value: 3000,
                  },
                  {
                    label: t("analytics.responseTime"),
                    value: 1398,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: t("analytics.firstResponseTime"),
                    value: 2000,
                  },
                  {
                    label: t("analytics.responseTime"),
                    value: 9800,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: t("analytics.firstResponseTime"),
                    value: 2780,
                  },
                  {
                    label: t("analytics.responseTime"),
                    value: 3908,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: t("analytics.firstResponseTime"),
                    value: 1890,
                  },
                  {
                    label: t("analytics.responseTime"),
                    value: 4800,
                  },
                ],
              },
            ]}
            helpMessage={t("analytics.averageResponseTimeHelp")}
            name={t("analytics.averageResponseTime")}
          />
          <RadarChart
            data={[
              { name: "Member 1", value: 20 },
              { name: "Member 2", value: 200 },
              { name: "Member 3", value: 300 },
              { name: "Member 4", value: 500 },
              { name: "Member 5", value: 1000 },
              { name: "Member 6", value: 2000 },
            ]}
            helpMessage={t("analytics.averageFirstResponseTimeByAdminHelp")}
            name={t("analytics.averageFirstResponseTimeByAdmin")}
            valueLabel="Value"
          />
          <RadarChart
            data={[
              { name: "Member 1", value: 120 },
              { name: "Member 2", value: 200 },
              { name: "Member 3", value: 150 },
              { name: "Member 4", value: 280 },
              { name: "Member 5", value: 100 },
              { name: "Member 6", value: 220 },
              { name: "Member 7", value: 200 },
              {
                name: "Member 8",
                value: 300,
              },
              {
                name: "Member 9",
                value: 400,
              },
            ]}
            helpMessage={t("analytics.averageResponseTimeHelp")}
            name={t("analytics.averageResponseTimeByAdmin")}
            valueLabel="Minutes"
          />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: "Value",
                    value: 4000,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: "Value",
                    value: 3000,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: "Value",
                    value: 2000,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: "Value",
                    value: 2780,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: "Value",
                    value: 1890,
                  },
                ],
              },
            ]}
            helpMessage={t("analytics.averageDurationOfConversationHelp")}
            name={t("analytics.averageDurationOfConversation")}
          />
        </div>
        <ChatbotMemberAnalysis />
        <div className="grid grid-cols-2 gap-4">
          <BotMessagesByResultChart chatbotId={chatbotId} />
          <MessagesBySenderChart chatbotId={chatbotId} />
          <ConversationsMovedChart chatbotId={chatbotId} />
          <DonutChart
            data={[
              { name: "A", value: 400 },
              { name: "B", value: 300 },
              { name: "C", value: 300 },
              { name: "D", value: 200 },
              {
                name: "E",
                value: 278,
              },
              { name: "F", value: 189 },
              { name: "G", value: 100 },
            ]}
            helpMessage={t("analytics.uniqueConversationsByAdminsHelp")}
            name={t("analytics.uniqueConversationsByAdmins")}
            valueLabel={t("analytics.contacts")}
          />
          <RadarChart
            data={[
              { name: "Member 1", value: 120 },
              { name: "Member 2", value: 200 },
              { name: "Member 3", value: 150 },
              { name: "Member 4", value: 280 },
              { name: "Member 5", value: 100 },
              { name: "Member 6", value: 220 },
            ]}
            helpMessage={t("analytics.messagesSentByAdminsHelp")}
            name={t("analytics.messagesSentByAdmins")}
            valueLabel={t("analytics.messages")}
          />
          <ContactsByChannelChart chatbotId={chatbotId} />
          <ContactsBySourceChart chatbotId={chatbotId} />
          <DonutChart
            data={[
              { name: "A", value: 400 },
              { name: "B", value: 300 },
              { name: "C", value: 300 },
              { name: "D", value: 200 },
              {
                name: "E",
                value: 278,
              },
              { name: "F", value: 189 },
              { name: "G", value: 100 },
            ]}
            helpMessage={t("analytics.assignedConversationsByAdminsHelp")}
            name={t("analytics.assignedConversationsByAdmins")}
            valueLabel={t("analytics.conversations")}
          />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 2,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 0,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 3,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
            ]}
            helpMessage={t("analytics.assignedConversationsByAdminsHelp")}
            name={t("analytics.assignedConversations")}
          />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 2,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 0,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 3,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
            ]}
            helpMessage={t("analytics.followUpConversationsHelp")}
            name={t("analytics.followUpConversations")}
          />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 2,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 0,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 3,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
            ]}
            name={t("analytics.archivedConversations")}
          />
          <BarChart
            data={[
              {
                name: "Jan 7",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
              {
                name: "Jan 8",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 2,
                  },
                ],
              },
              {
                name: "Jan 9",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 0,
                  },
                ],
              },
              {
                name: "Jan 10",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 3,
                  },
                ],
              },
              {
                name: "Jan 11",
                value: [
                  {
                    label: t("analytics.conversations"),
                    value: 1,
                  },
                ],
              },
            ]}
            helpMessage={t("analytics.blockedConversationsHelp")}
            name={t("analytics.blockedConversations")}
          />
          <ContactsByCountryChart chatbotId={chatbotId} />
        </div>
      </AnalysisStoreProvider>
    </div>
  )
}
