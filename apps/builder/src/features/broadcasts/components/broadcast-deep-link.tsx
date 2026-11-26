"use client"

import { useTranslations } from "next-intl"
import { useQueryState } from "nuqs"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { BroadcastDetailDialog } from "../broadcast-detail-dialog"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { broadcastsSearchParsers } from "../schema/search-parsers"

type BroadcastDeepLinkProps = {
  /** The id the URL asked for. */
  broadcastId: string
  /** The broadcast it resolved to, or null when it does not exist in this workspace. */
  broadcast: BroadcastResourceWithRelations | null
}

/**
 * Opens one broadcast's detail dialog over the list for a `?broadcastId=`
 * link. The dialog follows the URL: closing it removes the param without
 * reloading the list, and a link to the same broadcast opens it again. An id
 * that resolves to nothing says so once and is dropped from the URL.
 */
export function BroadcastDeepLink({
  broadcastId,
  broadcast,
}: BroadcastDeepLinkProps) {
  const t = useTranslations("broadcasts.detail")
  const [currentId, setCurrentId] = useQueryState(
    "broadcastId",
    broadcastsSearchParsers.broadcastId,
  )

  // The page keeps this mounted after the param is dropped: say it once per
  // visit to the link, and again when the same link is followed anew.
  const reportedId = useRef<string | null>(null)
  useEffect(() => {
    if (broadcast || currentId !== broadcastId) {
      reportedId.current = null
      return
    }
    if (reportedId.current === broadcastId) {
      return
    }
    reportedId.current = broadcastId
    // On a fresh page load the Toaster, a later sibling in the layout, has not
    // subscribed yet when this effect runs, and a toast sent now is dropped.
    // Left to run even if this unmounts first: it is a one-off message.
    const message = t("linkNotFound")
    setTimeout(() => toast.error(message), 0)
    setCurrentId(null)
  }, [broadcast, broadcastId, currentId, setCurrentId, t])

  if (!broadcast) {
    return null
  }
  return (
    <BroadcastDetailDialog
      broadcast={broadcast}
      onOpenChange={(open) => {
        if (!open) {
          setCurrentId(null)
        }
      }}
      open={currentId === broadcastId}
    />
  )
}
