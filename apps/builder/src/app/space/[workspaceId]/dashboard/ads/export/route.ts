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
  // Viewer IANA timezone (mirrors `buildExportHref`'s `tz` param) so the CSV
  // rows use the exact same [since, until] window as the on-screen dashboard
  // instead of silently reverting to UTC anchoring. Omitted/invalid resolves
  // to "UTC" in `resolveTimezone` — old export links keep working unchanged.
  tz: z.string().trim().max(64).optional(),
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
  // See `exportRequestSchema.tz`.
  tz: z.string().trim().max(64).optional(),
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
 * `fetchPage` until it reports no further page, same cursor contract each
 * mode's `listExportRows`/`listAllChannelExportRows` call uses. `toCells`
 * lets each mode decide its own column set (the legacy CTWA export
 * intentionally has no channel column — see the GET handler), so this
 * streamer hard-codes neither the columns nor any channel.
 *
 * Stops on `fetchPage`'s own `hasMore` flag rather than `rows.length <
 * EXPORT_PAGE_SIZE`: `hasMore` is derived from an over-fetch at the
 * repository layer (`listExportSegmentRows`), which is the only place that
 * knows whether another page exists independent of how many rows this page
 * happened to contain.
 */
function streamCsvResponse(input: {
  filename: string
  header: string[]
  toCells: (row: CsvExportRow) => (string | null)[]
  fetchPage: (
    afterId: string | undefined,
  ) => Promise<{ rows: CsvExportRow[]; hasMore: boolean }>
}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toCsvRow(input.header)))

      let afterId: string | undefined
      for (;;) {
        const { rows, hasMore } = await input.fetchPage(afterId)

        for (const row of rows) {
          controller.enqueue(encoder.encode(toCsvRow(input.toCells(row))))
        }

        afterId = rows.at(-1)?.id
        if (!(hasMore && afterId)) {
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
// stay byte-identical to the pre-multichannel CSV SHAPE (column layout,
// header, filename pattern) that external consumers already parse. This is
// a shape guarantee only — it does NOT promise the same ROWS come back for
// a given URL. A legacy URL that carries a messenger/instagram integration
// id with no `channel` used to hit a contradictory predicate (whatsapp
// default + a foreign integration id) and silently return zero rows; it now
// correctly scopes to that integration and returns real rows, still in the
// unchanged 4-column legacy shape. See
// `apps/builder/__tests__/ads-analytics-export-route.test.ts`.
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
        const { rows, hasMore } =
          await adsConversionService.listAllChannelExportRows({
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
        return {
          rows: rows.map((row) => ({
            id: row.id,
            contactName: row.contactName,
            phoneNumber: row.phoneNumber,
            adId: row.adId,
            occurredAt: row.occurredAt,
            channelLabel: row.channel
              ? t(`ads.conversionEvents.tabs.${row.channel}`)
              : "",
          })),
          hasMore,
        }
      },
    })
  }

  const parsed = exportRequestSchema.safeParse(rawParams)
  if (!parsed.success) {
    return Response.json({ code: "invalidRequest" }, { status: 400 })
  }

  const { since, until, from, to } = parseAnalyticsDateRange(parsed.data)
  const t = await getTranslations()
  // Label-only resolution: the CSV column/filename need SOME channel word
  // even for a fully-unscoped legacy request. The query-scoping default (used
  // when the service call omits both `channel` and every integration id) now
  // lives in `adsConversionService.listExportRows` — a single shared rule
  // instead of two divergent copies (see AGENTS.md invariant on
  // `data-access.md`'s "no app-layer file holds a rule a worker/public API
  // would also need"). This local mirrors that same default purely for
  // display, and is never sent to the service.
  const labelChannel = parsed.data.channel ?? DEFAULT_ADS_CONVERSION_CHANNEL

  // OUTPUT format is keyed on whether the request carried a `channel` param at
  // all, NOT on the resolved value. An omitted-channel request is a legacy/
  // external consumer that already parses the original 4-column `ctwa-*.csv`;
  // it must stay byte-identical (no channel column, `ctwa-` filename). Every
  // in-app export href sends `channel` explicitly (`buildExportHref`), so the
  // new 5-column `ads-<channel>-*.csv` format only reaches the new UI.
  const isLegacyExport = parsed.data.channel === undefined
  const channelLabel = t(`ads.conversionEvents.tabs.${labelChannel}`)
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
    : `ads-${labelChannel}-${parsed.data.segment}-${from}-${to}.csv`

  return streamCsvResponse({
    filename,
    header,
    toCells: isLegacyExport ? legacyCells : channelCells,
    fetchPage: async (afterId) => {
      // `channel` is passed through as the request sent it (undefined stays
      // undefined) — the query-scoping default for the fully-unscoped case
      // now lives in `adsConversionService.listExportRows`, not here.
      const { rows, hasMore } = await adsConversionService.listExportRows({
        workspaceId,
        segment: parsed.data.segment,
        adId: parsed.data.adId,
        integrationWhatsappId: parsed.data.integrationWhatsappId,
        channel: parsed.data.channel,
        integrationMessengerId: parsed.data.integrationMessengerId,
        integrationInstagramId: parsed.data.integrationInstagramId,
        since,
        until,
        afterId,
        limit: EXPORT_PAGE_SIZE,
      })

      return {
        rows: rows.map((row) => ({
          id: row.id,
          contactName: row.contactName,
          phoneNumber: row.phoneNumber,
          adId: row.adId,
          occurredAt: row.occurredAt,
          channelLabel,
        })),
        hasMore,
      }
    },
  })
}
