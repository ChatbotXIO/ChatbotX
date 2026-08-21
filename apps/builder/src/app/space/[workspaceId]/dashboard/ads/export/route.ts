import { adsConversionService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { toCsvRow } from "@/features/ads/lib/csv"
import { parseAnalyticsDateRange } from "@/features/ads/schemas/analytics"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export const runtime = "nodejs"

const exportRequestSchema = z.object({
  segment: z.enum(["conversations", "leads", "purchases"]),
  adId: z.string().trim().min(1).nullable().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
})

const EXPORT_PAGE_SIZE = 500

export async function GET(
  request: Request,
  props: { params: Promise<{ workspaceId: string }> },
) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  const parsed = exportRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!parsed.success) {
    return Response.json({ code: "invalidRequest" }, { status: 400 })
  }

  const { since, until, from, to } = parseAnalyticsDateRange(parsed.data)
  const t = await getTranslations()
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          toCsvRow([
            t("ads.analytics.csv.contactName"),
            t("ads.analytics.csv.phone"),
            t("ads.analytics.csv.adId"),
            t("ads.analytics.csv.occurredAt"),
          ]),
        ),
      )

      let afterId: string | undefined
      for (;;) {
        const rows = await adsConversionService.listExportRows({
          workspaceId,
          segment: parsed.data.segment,
          adId: parsed.data.adId,
          integrationWhatsappId: parsed.data.integrationWhatsappId,
          since,
          until,
          afterId,
          limit: EXPORT_PAGE_SIZE,
        })

        for (const row of rows) {
          controller.enqueue(
            encoder.encode(
              toCsvRow([
                row.contactName,
                row.phoneNumber,
                row.adId,
                row.occurredAt.toISOString(),
              ]),
            ),
          )
        }

        afterId = rows.at(-1)?.id
        if (rows.length < EXPORT_PAGE_SIZE || !afterId) {
          break
        }
      }

      controller.close()
    },
  })

  const filename = `ctwa-${parsed.data.segment}-${from}-${to}.csv`
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}
