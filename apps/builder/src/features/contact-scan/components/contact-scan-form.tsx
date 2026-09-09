"use client"

import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { CONTACT_SCAN_CHANNELS } from "@chatbotx.io/utils/channel"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { parse } from "date-fns"
import { HistoryIcon, Loader2 } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useInboxOptionsForChannels } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import { pollUntilSettled } from "@/lib/query/poll-until-settled"
import { scheduleContactScanAction } from "../actions/schedule-contact-scan.action"
import { DATE_TIME_FORMAT_OPTIONS } from "../lib/constants"
import { scheduleContactScanRequest } from "../schema/action"
import type { GetContactScanStatusResponse } from "../schema/query"
import { ContactScanStatusPanel } from "./contact-scan-status-panel"

/** The panel keeps polling until the run settles — or there was never one. */
const SETTLED_STATUSES: GetContactScanStatusResponse["status"][] = [
  "succeeded",
  "partial",
  "failed",
  "idle",
]

/**
 * Matches `DateTimePickerField`'s default `dateTimeFormat` — the "scan
 * from" field below doesn't override it, so this is the exact string shape
 * `field.onChange` saves into `scanFromAt`'s form value.
 */
const SCAN_FROM_SAVE_FORMAT = "yyyy-MM-dd HH:mm:ss"

/**
 * `scanFromAt`'s form value is saved as a formatted string (see
 * `SCAN_FROM_SAVE_FORMAT`) even though the schema's inferred type says
 * `Date` (`z.coerce.date()`'s output type) — parse defensively so the
 * dynamic description below reads correctly regardless of which shape is
 * actually in the form store.
 */
function parseScanFromAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = parse(value, SCAN_FROM_SAVE_FORMAT, new Date())
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Page-embedded form for the Automatic Customer Scan
 * (`app/space/[workspaceId]/contacts/scan/page.tsx`) — inbox picker,
 * "scan from" date picker, polled status panel, and submit wiring, with no
 * Dialog shell. A successful submit stays on the page (there is no dialog to
 * close) and lets the polled status query pick up the freshly scheduled run.
 */
export function ContactScanForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const formatter = useFormatter()
  const queryClient = useQueryClient()

  const inboxOptions = useInboxOptionsForChannels(CONTACT_SCAN_CHANNELS)

  const { form, handleSubmitWithAction } = useHookFormAction(
    scheduleContactScanAction.bind(null, workspaceId),
    zodResolver(scheduleContactScanRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("contactScan.title"),
            }),
          )
          queryClient.invalidateQueries({
            queryKey:
              orpc.contactScanAPIs.getContactScanStatusAuthenticatedAPI.key({
                input: { workspaceId, inboxId },
              }),
          })
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  const inboxId = form.watch("inboxId")
  const scanFromAt = parseScanFromAt(form.watch("scanFromAt"))

  const { data } = useQuery(
    orpc.contactScanAPIs.getContactScanStatusAuthenticatedAPI.queryOptions({
      input: { workspaceId, inboxId: inboxId ?? "" },
      enabled: Boolean(inboxId),
      refetchInterval:
        pollUntilSettled<GetContactScanStatusResponse>(SETTLED_STATUSES),
    }),
  )

  const canScan = data ? data.availability.canScan : true

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-lg leading-none">
            {t("contactScan.title")}
          </h1>
        </div>

        <Link
          className="inline-flex shrink-0 items-center gap-1 text-blue-600 text-sm hover:underline"
          href={`/space/${workspaceId}/contacts/scan/histories`}
        >
          <HistoryIcon size={16} />
          {t("contactScan.histories.title")}
        </Link>
      </div>

      <Form {...form}>
        <form className="space-y-4" onSubmit={handleSubmitWithAction}>
          <SelectField
            label={t("contactScan.fields.inbox")}
            name="inboxId"
            options={inboxOptions}
            required
          />

          <DateTimePickerField
            disabled={canScan ? { after: new Date() } : true}
            displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
            granularity="minute"
            label={t("contactScan.fields.scanFrom")}
            name="scanFromAt"
            required
          />

          <p className="text-muted-foreground text-xs">
            {scanFromAt
              ? t("contactScan.hint.range", {
                  from: formatter.dateTime(
                    scanFromAt,
                    DATE_TIME_FORMAT_OPTIONS,
                  ),
                })
              : t("contactScan.hint.beforeChoose")}
          </p>

          <ContactScanStatusPanel data={data} />

          {/* Only actionable state gets a button: a centered "Automatic Scan"
              submit when a new scan is allowed. When a scan is already running
              or the 24h cooldown is active, the status panel above explains
              why and no button is shown. */}
          {canScan && (
            <div className="flex justify-end">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                {t("contactScan.submit")}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}
