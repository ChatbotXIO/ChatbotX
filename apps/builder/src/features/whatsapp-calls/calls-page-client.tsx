"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useQueryState } from "nuqs"
import { useState } from "react"
import { toast } from "sonner"
import { listWhatsappCallsAction } from "./actions/list-whatsapp-calls.action"
import { CallsEmptyState } from "./calls-empty-state"
import { type CallFilterOption, CallsFilterBar } from "./calls-filter-bar"
import { CallsTable } from "./calls-table"
import {
  activityQueryParser,
  agentUserIdQueryParser,
  type CALL_ACTIVITY_CHIPS,
  inboxIdQueryParser,
} from "./schema/query"
import type { WhatsappCallHistoryResource } from "./schema/resource"

type ActivityChip = (typeof CALL_ACTIVITY_CHIPS)[number]

type CallsPageClientProps = {
  workspaceId: string
  activity: ActivityChip | undefined
  initialData: WhatsappCallHistoryResource[]
  initialNextCursor: string | null
  inboxId?: string
  agentUserId?: string
  inboxOptions?: CallFilterOption[]
  agentOptions?: CallFilterOption[]
  /** The agent select is admin-only (`superAdmin || analytics`). */
  showAgentFilter?: boolean
}

/**
 * Owns client-local cursor pagination. Changing the activity chip triggers a
 * real Next.js navigation (`shallow: false`) that re-runs `listWhatsappCalls`
 * server-side; "Load more" calls `listWhatsappCallsAction` directly and
 * appends, so the URL never encodes the cursor. `page.tsx` keys this
 * component by `activity` so a filter change remounts it and resets state.
 */
export function CallsPageClient({
  workspaceId,
  activity,
  initialData,
  initialNextCursor,
  inboxId,
  agentUserId,
  inboxOptions = [],
  agentOptions = [],
  showAgentFilter = false,
}: CallsPageClientProps) {
  const t = useTranslations("whatsapp.calls.page")
  const [rows, setRows] = useState(initialData)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [, setActivityParam] = useQueryState(
    "activity",
    activityQueryParser.withOptions({ shallow: false, clearOnDefault: true }),
  )
  // Same navigation contract as `activity`: a `shallow: false` URL update re-
  // runs `page.tsx` server-side for a fresh page 1, matching the activity-chip
  // behavior instead of only appending.
  const [, setInboxParam] = useQueryState(
    "inboxId",
    inboxIdQueryParser.withOptions({ shallow: false, clearOnDefault: true }),
  )
  const [, setAgentParam] = useQueryState(
    "agentUserId",
    agentUserIdQueryParser.withOptions({
      shallow: false,
      clearOnDefault: true,
    }),
  )
  // `listWhatsappCallsAction` uses `bindArgsSchemas` for `workspaceId`, so it
  // must be `.bind(null, workspaceId)`-ed before `useAction` — otherwise
  // `execute()` would be one argument short.
  const { execute, isPending } = useAction(
    listWhatsappCallsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        setRows((current) => [...current, ...data.data])
        setNextCursor(data.nextCursor)
      },
      // An undecodable/failed "Load more" request now surfaces a translated
      // toast instead of failing silently.
      onError: () => {
        toast.error(t("loadMoreError"))
      },
    },
  )

  return (
    <div className="flex flex-col gap-4">
      <CallsFilterBar
        activity={activity}
        agentOptions={agentOptions}
        agentUserId={agentUserId}
        inboxId={inboxId}
        inboxOptions={inboxOptions}
        onActivityChange={(nextActivity) =>
          setActivityParam(nextActivity ?? null)
        }
        onAgentChange={(nextAgentUserId) =>
          setAgentParam(nextAgentUserId ?? null)
        }
        onInboxChange={(nextInboxId) => setInboxParam(nextInboxId ?? null)}
        showAgentFilter={showAgentFilter}
      />
      {rows.length === 0 ? (
        <CallsEmptyState
          hasActiveFilter={Boolean(activity || inboxId || agentUserId)}
        />
      ) : (
        <>
          <CallsTable data={rows} workspaceId={workspaceId} />
          {nextCursor && (
            <Button
              className="self-center"
              disabled={isPending}
              onClick={() =>
                execute({
                  activity,
                  inboxId,
                  agentUserId,
                  cursor: nextCursor ?? undefined,
                })
              }
              variant="outline"
            >
              {t("loadMore")}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
