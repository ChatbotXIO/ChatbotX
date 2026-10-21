"use client"

import {
  CHANNEL_CAPABILITIES,
  type ChannelType,
  CREATABLE_CHANNELS,
} from "@chatbotx.io/database/partials"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect } from "react"
import type { MessageKey } from "@/features/channel-connect/lib/message-key"
import { InboxIcon } from "./inbox-icon"

/** Query param a failed connect redirects back with (see `createFirstWorkspace`). */
const ERROR_PARAM = "error"

/**
 * Treats `?error=` as a one-shot flash: the server already turned it into
 * `errorMessageKey` for this render, so it is dropped from the address bar
 * right away. A reload then shows the clean picker instead of replaying an
 * old failure. `history.replaceState` (not `router.replace`) keeps the
 * current render, so the alert stays visible until the user moves on.
 *
 * The state argument must be `null`: Next's `replaceState` wrapper skips its
 * router sync when the state already carries its internal `__NA` marker, so
 * passing `window.history.state` would leave `useSearchParams` stale. With
 * `null`, Next copies its own history state over and syncs the URL.
 */
function useDropErrorParam(searchParams: URLSearchParams) {
  // Keyed on `searchParams`, not mount: a soft navigation to this same page
  // keeps the component mounted and can bring a new `?error=`. Once our own
  // replaceState lands, Next syncs `searchParams` and this re-run no-ops.
  useEffect(() => {
    if (!searchParams.has(ERROR_PARAM)) {
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete(ERROR_PARAM)
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [searchParams])
}

type InboxSelectCardProps = {
  configuredChannels: ChannelType[]
  /** Why the previous connect attempt could not start (e.g. the plan's workspace limit); rendered above the channel list. */
  errorMessageKey?: MessageKey
  /**
   * Channels offered on this picker, already filtered to what the caller's
   * platform admin / white-label owner allows. Defaults to every creatable
   * channel so callers that haven't been wired up to channel-visibility yet
   * keep today's behavior unchanged.
   */
  offeredChannels?: ChannelType[]
}

function InboxSelectCard({
  configuredChannels,
  errorMessageKey,
  offeredChannels = CREATABLE_CHANNELS,
}: InboxSelectCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  useDropErrorParam(searchParams)

  const handleInboxSelect = useCallback(
    (channel: ChannelType) => {
      const params = new URLSearchParams(searchParams.toString())
      // The reason for a stumble does not travel to the next channel:
      // explaining a Messenger failure on the Telegram screen describes
      // something that did not happen there.
      params.delete(ERROR_PARAM)
      // `set`, not append: concatenating `&channel=` onto a query string that
      // may already carry one yields two, which Next parses into an array
      // while `CreateChannelPageProps` declares `channel?: string | null`.
      params.set("channel", channel)
      router.push(`/channels/create?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("actions.createFeature", { feature: t("fields.workspace.label") })}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        {errorMessageKey && (
          <Alert className="mb-4" role="alert" variant="destructive">
            <AlertDescription>{t(errorMessageKey)}</AlertDescription>
          </Alert>
        )}
        <ul aria-label="Available inbox types" className="flex flex-col gap-4">
          {offeredChannels.map((channel) => (
            <li className="flex items-center gap-2" key={channel}>
              <div className="min-w-0 flex-1">
                <InboxIcon channel={channel} size="large" />
              </div>
              <Button
                disabled={
                  CHANNEL_CAPABILITIES[channel].requiresCredential &&
                  !configuredChannels.includes(channel)
                }
                onClick={() => handleInboxSelect(channel)}
                type="button"
                variant="secondary"
              >
                {t("actions.continue")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default memo(InboxSelectCard)
