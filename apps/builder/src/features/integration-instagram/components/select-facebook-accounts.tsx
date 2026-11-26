"use client"

import { ConnectPickerScreen } from "@/features/channel-connect/components/connect-picker-screen"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import {
  CONNECT_CHANNEL_REGISTRY,
  INSTAGRAM_DIRECT_CONNECT_ROUTE,
} from "@/features/channel-connect/lib/registry"
import { connectActionResultSchemaDefault } from "@/features/channel-connect/schema"

/**
 * Multi-account Instagram picker, mirroring `MessengerPages` (plan §3.2):
 * the provider list has already been narrowed to accounts the user can
 * manage, so — unlike Messenger's pages — there is no "not an admin" state,
 * only selectable vs. already-connected.
 *
 * `provider` must match the `ConnectSession`'s provider: the Facebook-login
 * session (`instagramFacebook`) and the Unified Login session (`instagram`)
 * connect through different routes, and each route rejects the other's
 * session.
 */
export function SelectFacebookAccounts({
  sessionId,
  workspaceId,
  items,
  provider = "instagramFacebook",
}: {
  sessionId: string
  workspaceId: string
  items: ConnectPickerItem[]
  provider?: "instagram" | "instagramFacebook"
}) {
  const route =
    provider === "instagram"
      ? INSTAGRAM_DIRECT_CONNECT_ROUTE
      : CONNECT_CHANNEL_REGISTRY.instagram.connectRoute
  // The oRPC route, not the server action — see `MessengerPages`.
  const connectOne = (item: ConnectPickerItem) =>
    connectViaApi({
      route,
      body: { sessionId, igId: item.id },
      parse: (data) => connectActionResultSchemaDefault.parse(data),
      item,
    })

  return (
    <ConnectPickerScreen
      channel="instagram"
      connectOne={connectOne}
      idsFieldName="igIds"
      items={items}
      workspaceId={workspaceId}
    />
  )
}
