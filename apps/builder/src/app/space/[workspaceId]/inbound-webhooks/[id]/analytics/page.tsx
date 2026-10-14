import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { InboundWebhookRequestsPanel } from "@/features/inbound-webhooks/components/inbound-webhook-requests-panel"
import {
  findInboundWebhookForEditor,
  listInboundWebhookRequests,
} from "@/features/inbound-webhooks/queries"
import {
  inboundWebhookRequestsSearchParamsCache,
  REQUESTS_PER_PAGE,
} from "@/features/inbound-webhooks/schema/query"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function InboundWebhookAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    notFound()
  }
  const { workspaceId, id } = data
  await requireWorkspacePermission(workspaceId, "superAdmin")

  const { requestsPage } = inboundWebhookRequestsSearchParamsCache.parse(
    await searchParams,
  )

  const loaded = await Promise.all([
    findInboundWebhookForEditor({ workspaceId, id }),
    listInboundWebhookRequests({
      workspaceId,
      inboundWebhookId: id,
      page: requestsPage,
      perPage: REQUESTS_PER_PAGE,
    }),
  ]).catch((error: unknown) => {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  })
  if (!loaded) {
    notFound()
  }
  const [webhook, requests] = loaded
  const [t, format] = await Promise.all([getTranslations(), getFormatter()])
  const editorHref = `/space/${workspaceId}/inbound-webhooks/${id}`

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("inboundWebhooks.title"),
            href: `/space/${workspaceId}/inbound-webhooks`,
          },
          { label: webhook.name, href: editorHref },
          { label: t("inboundWebhooks.analytics.title"), href: "" },
        ]}
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-bold text-xl">
                {webhook.name}
              </CardTitle>
            </div>
            <Link
              className="inline-flex items-center gap-1 text-sm hover:underline"
              href={editorHref}
            >
              <ArrowLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
              {t("inboundWebhooks.analytics.back")}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {t("inboundWebhooks.analytics.totalRequests")}
          </p>
          <p className="font-bold text-3xl">
            {format.number(webhook.requestCount)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("inboundWebhooks.analytics.totalRequestsHint")}
          </p>
        </CardContent>
      </Card>
      <InboundWebhookRequestsPanel
        inboundWebhookId={id}
        page={requestsPage}
        pageCount={requests.pageCount}
        requests={requests.data}
        workspaceId={workspaceId}
      />
    </div>
  )
}
