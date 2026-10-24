import {
  ecommerceAnalyticsService,
  ecommerceSettingsService,
  workspaceService,
} from "@chatbotx.io/business"
import { AnalyticsDashboard } from "@/features/ecommerce-analytics/components/analytics-dashboard"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const dayParam = (value: string | string[] | undefined) => {
  const day = Array.isArray(value) ? value[0] : value
  return day && DAY_PATTERN.test(day) ? day : undefined
}

export default async function EcommerceAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { workspaceId } = await params
  const search = await searchParams
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [data, settings, workspace] = await Promise.all([
    ecommerceAnalyticsService.getDashboard({
      workspaceId,
      from: dayParam(search.from),
      to: dayParam(search.to),
    }),
    ecommerceSettingsService.get(workspaceId),
    workspaceService.findById({ id: workspaceId }),
  ])

  return (
    <AnalyticsDashboard
      data={data}
      referenceNow={new Date().toISOString()}
      store={{
        currency: settings.payments.currency,
        currencySymbol: settings.payments.currencySymbol,
        currencyPosition: settings.payments.currencyPosition,
      }}
      workspaceCreatedAt={workspace.createdAt}
    />
  )
}
