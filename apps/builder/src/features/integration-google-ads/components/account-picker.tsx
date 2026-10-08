"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { cancelGoogleAdsConnectAction } from "../actions/cancel-connect.action"
import { pickGoogleAdsAccountAction } from "../actions/pick-account.action"
import { syncGoogleAdsConversionActionsAction } from "../actions/sync-conversion-actions.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import { googleAdsSettingsPath } from "../lib/constants"
import { AwaitingSelectionView } from "./account-picker-selection"
import {
  PickerSkeleton,
  SessionFailureAlert,
  StalledView,
  WaitingView,
} from "./account-picker-views"
import { NoticeAlert } from "./notice-alert"

const POLL_INTERVAL_MS = 2000
/**
 * How long a session may stay `pending` or `authorized` before the picker
 * stops waiting. The OAuth callback lands within seconds of the redirect; a
 * session still `pending` after this never received it (closed tab, failed
 * callback), and one still `authorized` never reached the account list (the
 * candidate lookup failed transiently).
 */
const PENDING_TIMEOUT_MS = 20_000
const POLLING_STATUSES: ReadonlySet<string> = new Set(["pending", "authorized"])

type AccountPickerProps = {
  workspaceId: string
  initialSession: { id: string; status: string } | null
  /** The page was opened with `?connect_error=`: its alert already explains the failure, so the picker must not wait or repeat it. */
  hasConnectError?: boolean
}

export const AccountPicker = ({
  workspaceId,
  initialSession,
  hasConnectError = false,
}: AccountPickerProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()
  const [trackedId, setTrackedId] = useState<string | null>(
    initialSession?.id ?? null,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Session whose `pending` wait exceeded PENDING_TIMEOUT_MS.
  const [timedOutId, setTimedOutId] = useState<string | null>(null)
  // Failed/expired/cancelled session whose alert the user closed.
  const [dismissedFailureId, setDismissedFailureId] = useState<string | null>(
    null,
  )
  const [hasCancelFailed, setHasCancelFailed] = useState(false)
  const refreshedFor = useRef<string | null>(null)
  // Session the user picked an account for: `pick` already refreshed the setup.
  const pickedFor = useRef<string | null>(null)

  const inFlight = useQuery(
    orpc.googleAdsAPI.getInFlightConnectSession.queryOptions({
      input: { workspaceId },
    }),
  )
  const inFlightId = inFlight.data?.session?.id ?? null
  useEffect(() => {
    if (inFlightId) {
      // Never displace a session the page was opened for (e.g. a failed one).
      setTrackedId((current) => current ?? inFlightId)
    }
  }, [inFlightId])

  const sessionQuery = useQuery(
    orpc.connectSessionsAPI.getConnectSessionAPI.queryOptions({
      input: { workspaceId, id: trackedId ?? "" },
      enabled: Boolean(trackedId),
      refetchInterval: (query) =>
        timedOutId !== trackedId &&
        POLLING_STATUSES.has(query.state.data?.status ?? "")
          ? POLL_INTERVAL_MS
          : false,
    }),
  )
  const session = sessionQuery.data
  const sessionId = session?.id
  const isSessionWaiting = Boolean(
    session && POLLING_STATUSES.has(session.status),
  )

  // Stop waiting on a session that stays `pending`/`authorized`: its callback
  // never came or never reached the account list.
  useEffect(() => {
    if (!(sessionId && isSessionWaiting)) {
      return
    }
    const timer = setTimeout(() => setTimedOutId(sessionId), PENDING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [sessionId, isSessionWaiting])

  const onError = ({ error }: { error: { serverError?: string } }) => {
    if (error.serverError) {
      toast.error(error.serverError)
    }
  }
  const { execute: pick, isPending: isPicking } = useAction(
    pickGoogleAdsAccountAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        await invalidate()
        router.refresh()
      },
      onError,
    },
  )
  const { execute: cancel, isPending: isCancelling } = useAction(
    cancelGoogleAdsConnectAction.bind(null, workspaceId),
    {
      onSuccess: async () => {
        setTrackedId(null)
        setSelectedId(null)
        setTimedOutId(null)
        setHasCancelFailed(false)
        await invalidate()
        // Drop `?session=` so a refresh cannot resurrect the cleared session.
        router.replace(googleAdsSettingsPath(workspaceId))
        router.refresh()
      },
      onError: (args) => {
        setHasCancelFailed(true)
        onError(args)
      },
    },
  )
  // A session that completes without the picker (a reconnect, or a single
  // account) never ran `pick`, so a stale `setupError` from the revoked grant
  // would linger: re-read the setup once, then refresh the RSC tree.
  const { execute: syncSetup } = useAction(
    syncGoogleAdsConversionActionsAction.bind(null, workspaceId),
    {
      onSettled: async () => {
        await invalidate()
        router.refresh()
      },
    },
  )
  useEffect(() => {
    if (
      session?.status === "completed" &&
      refreshedFor.current !== session.id
    ) {
      refreshedFor.current = session.id
      if (pickedFor.current === session.id) {
        invalidate().then(() => router.refresh())
        return
      }
      syncSetup()
    }
  }, [session?.status, session?.id, invalidate, router, syncSetup])

  if (!trackedId) {
    return inFlight.isPending ? (
      <PickerSkeleton label={t("googleAds.picker.loading")} />
    ) : null
  }
  if (sessionQuery.isPending) {
    return <PickerSkeleton label={t("googleAds.picker.loading")} />
  }
  if (sessionQuery.isError || !session) {
    return (
      <NoticeAlert
        actions={
          <Button
            onClick={() => sessionQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("actions.retry")}
          </Button>
        }
        tone="destructive"
      >
        {t("googleAds.picker.loadError")}
      </NoticeAlert>
    )
  }
  if (session.status === "completed") {
    return null
  }
  // The page's `connect_error` alert already explains this outcome; a spinner
  // (or a second, vaguer failure message) beside it would only mislead.
  if (
    hasConnectError &&
    (POLLING_STATUSES.has(session.status) || session.status === "failed")
  ) {
    return null
  }

  const cancelError = hasCancelFailed ? (
    <p className="text-destructive text-sm" role="alert">
      {t("googleAds.picker.cancelFailed")}
    </p>
  ) : null
  const cancelSession = () => {
    setHasCancelFailed(false)
    cancel({ sessionId: session.id })
  }
  const cancelButton = (
    <Button
      disabled={isCancelling || isPicking}
      onClick={cancelSession}
      size="sm"
      type="button"
      variant="ghost"
    >
      {t("actions.cancel")}
    </Button>
  )

  if (POLLING_STATUSES.has(session.status) && timedOutId === session.id) {
    return (
      <StalledView
        cancelError={cancelError}
        isCancelling={isCancelling}
        onDismiss={cancelSession}
      />
    )
  }
  if (POLLING_STATUSES.has(session.status)) {
    return <WaitingView cancelButton={cancelButton} cancelError={cancelError} />
  }

  if (session.status === "awaiting_selection") {
    return (
      <AwaitingSelectionView
        cancelButton={cancelButton}
        cancelError={cancelError}
        isPicking={isPicking}
        onConnect={() => {
          if (selectedId) {
            pickedFor.current = session.id
            pick({ sessionId: session.id, customerId: selectedId })
          }
        }}
        onSelect={setSelectedId}
        selectedId={selectedId}
        targets={session.targets}
      />
    )
  }

  if (dismissedFailureId === session.id) {
    return null
  }
  return (
    <SessionFailureAlert
      dismissLabel={t("googleAds.picker.dismiss")}
      onDismiss={() => setDismissedFailureId(session.id)}
      session={session}
    />
  )
}
