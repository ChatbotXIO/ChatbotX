import { adsConversionService } from "@chatbotx.io/business"
import { adsConversionChannelSchema } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DEFAULT_ADS_CONVERSION_CHANNEL } from "@chatbotx.io/utils/channel"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { toCsvRow } from "@/features/ads/lib/csv"
import { parseAnalyticsDateRange } from "@/features/ads/schema/analytics"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export const runtime = "nodejs"

const exportRequestSchema = z.object({
  segment: z.enum(["conversations", "leads", "purchases"]),
  adId: z.string().trim().min(1).nullable().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  // `channel`/`integrationMessengerId`/`integrationInstagramId` widen this
  // beyond WhatsApp (Phase 6) — additive next to `integrationWhatsappId`,
  // omitted keeps every pre-Phase-6 caller's WhatsApp-only behavior
  // unchanged. Mirrors `ListAdsConversionExportRowsInput` (business schema).
  channel: adsConversionChannelSchema.optional(),
  integrationMessengerId: zodBigintAsString().optional(),
  integrationInstagramId: zodBigintAsString().optional(),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
})

/**
 * Analytics-only "All channels" export mode (decision 6) — a SEPARATE schema
 * from `exportRequestSchema`, not a branch bolted onto it: no `channel`/
 * integration fields at all, since aggregating across every channel has no
 * single channel or integration to scope to. Validated independently of
 * `adsConversionChannelSchema` (which "all" is never a member of), so this
 * never touches — and can never weaken — the legacy schema's
 * "omitted = whatsapp" default.
 */
const allChannelExportRequestSchema = z.object({
  segment: z.enum(["conversations", "leads", "purchases"]),
  adId: z.string().trim().min(1).nullable().optional(),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
})

const EXPORT_PAGE_SIZE = 500

type CsvExportRow = {
  id: string
  contactName: string | null
  phoneNumber: string | null
  adId: string | null
  occurredAt: Date
  channelLabel: string
}

/**
 * Shared CSV streaming mechanics for every export mode below — page through
 * `fetchPage` until a short page ends the pagination loop, same cursor
 * contract each mode's `listExportRows`/`listAllChannelExportRows` call uses.
 * `toCells` lets each mode decide its own column set (the legacy CTWA export
 * intentionally has no channel column — see the GET handler), so this streamer
 * hard-codes neither the columns nor any channel.
 */
function streamCsvResponse(input: {
  filename: string
  header: string[]
  toCells: (row: CsvExportRow) => (string | null)[]
  fetchPage: (afterId: string | undefined) => Promise<CsvExportRow[]>
}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toCsvRow(input.header)))

      let afterId: string | undefined
      for (;;) {
        const rows = await input.fetchPage(afterId)

        for (const row of rows) {
          controller.enqueue(encoder.encode(toCsvRow(input.toCells(row))))
        }

        afterId = rows.at(-1)?.id
        if (rows.length < EXPORT_PAGE_SIZE || !afterId) {
          break
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}

// The channel-column cell set (explicit-channel + all-channel modes). The
// legacy omitted-channel export uses `legacyCells` (no channel column) to
// stay byte-identical to the pre-multichannel CSV that external consumers
// already parse.
const channelCells = (row: CsvExportRow): (string | null)[] => [
  row.contactName,
  row.phoneNumber,
  row.adId,
  row.occurredAt.toISOString(),
  row.channelLabel,
]

const legacyCells = (row: CsvExportRow): (string | null)[] => [
  row.contactName,
  row.phoneNumber,
  row.adId,
  row.occurredAt.toISOString(),
]

export async function GET(
  request: Request,
  props: { params: Promise<{ workspaceId: string }> },
) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  const rawParams = Object.fromEntries(new URL(request.url).searchParams)

  // Checked via the RAW query param (not `adsConversionChannelSchema`,
  // which "all" is never a member of) so a well-formed `channel=all`
  // request is routed here before ever reaching the legacy schema below —
  // the legacy omitted-`channel` param path stays byte-unchanged.
  if (rawParams.channel === "all") {
    const parsed = allChannelExportRequestSchema.safeParse(rawParams)
    if (!parsed.success) {
      return Response.json({ code: "invalidRequest" }, { status: 400 })
    }

    const { since, until, from, to } = parseAnalyticsDateRange(parsed.data)
    const t = await getTranslations()
    const header = [
      t("ads.analytics.csv.contactName"),
      t("ads.analytics.csv.phone"),
      t("ads.analytics.csv.adId"),
      t("ads.analytics.csv.occurredAt"),
      t("ads.analytics.csv.channel"),
    ]

    // Channel-neutral filename (no single channel scopes this export).
    const filename = `ads-all-${parsed.data.segment}-${from}-${to}.csv`

    return streamCsvResponse({
      filename,
      header,
      toCells: channelCells,
      fetchPage: async (afterId) => {
        const rows = await adsConversionService.listAllChannelExportRows({
          workspaceId,
          segment: parsed.data.segment,
          adId: parsed.data.adId,
          since,
          until,
          afterId,
          limit: EXPORT_PAGE_SIZE,
        })

        // Each row's REAL channel, not a single request-wide label — the
        // whole point of the "all channels" export mode.
        return rows.map((row) => ({
          id: row.id,
          contactName: row.contactName,
          phoneNumber: row.phoneNumber,
          adId: row.adId,
          occurredAt: row.occurredAt,
          channelLabel: row.channel
            ? t(`ads.conversionEvents.tabs.${row.channel}`)
            : "",
        }))
      },
    })
  }

  const parsed = exportRequestSchema.safeParse(rawParams)
  if (!parsed.success) {
    return Response.json({ code: "invalidRequest" }, { status: 400 })
  }

  const { since, until, from, to } = parseAnalyticsDateRange(parsed.data)
  const t = await getTranslations()
  // Resolve the channel that SCOPES THE QUERY: a legacy no-channel URL must
  // stay WhatsApp-scoped (mirrors `integrationWhatsappId` before it) — with
  // `channel` omitted, the leads/purchases event predicate would apply no
  // channel filter at all, mixing messenger/instagram events into rows a
  // WhatsApp consumer expects.
  const channel = parsed.data.channel ?? DEFAULT_ADS_CONVERSION_CHANNEL

  // OUTPUT format is keyed on whether the request carried a `channel` param at
  // all, NOT on the resolved value. An omitted-channel request is a legacy/
  // external consumer that already parses the original 4-column `ctwa-*.csv`;
  // it must stay byte-identical (no channel column, `ctwa-` filename). Every
  // in-app export href sends `channel` explicitly (`buildExportHref`), so the
  // new 5-column `ads-<channel>-*.csv` format only reaches the new UI.
  const isLegacyExport = parsed.data.channel === undefined
  const channelLabel = t(`ads.conversionEvents.tabs.${channel}`)
  const header = isLegacyExport
    ? [
        t("ads.analytics.csv.contactName"),
        t("ads.analytics.csv.phone"),
        t("ads.analytics.csv.adId"),
        t("ads.analytics.csv.occurredAt"),
      ]
    : [
        t("ads.analytics.csv.contactName"),
        t("ads.analytics.csv.phone"),
        t("ads.analytics.csv.adId"),
        t("ads.analytics.csv.occurredAt"),
        t("ads.analytics.csv.channel"),
      ]
  const filename = isLegacyExport
    ? `ctwa-${parsed.data.segment}-${from}-${to}.csv`
    : `ads-${channel}-${parsed.data.segment}-${from}-${to}.csv`

  return streamCsvResponse({
    filename,
    header,
    toCells: isLegacyExport ? legacyCells : channelCells,
    fetchPage: async (afterId) => {
      const rows = await adsConversionService.listExportRows({
        workspaceId,
        segment: parsed.data.segment,
        adId: parsed.data.adId,
        integrationWhatsappId: parsed.data.integrationWhatsappId,
        channel,
        integrationMessengerId: parsed.data.integrationMessengerId,
        integrationInstagramId: parsed.data.integrationInstagramId,
        since,
        until,
        afterId,
        limit: EXPORT_PAGE_SIZE,
      })

      return rows.map((row) => ({
        id: row.id,
        contactName: row.contactName,
        phoneNumber: row.phoneNumber,
        adId: row.adId,
        occurredAt: row.occurredAt,
        channelLabel,
      }))
    },
  })
}
