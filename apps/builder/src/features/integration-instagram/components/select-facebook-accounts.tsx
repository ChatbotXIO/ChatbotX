"use client"

import { ConnectPickerScreen } from "@/features/channel-connect/components/connect-picker-screen"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"
import { connectActionResultSchemaDefault } from "@/features/channel-connect/schema"

/**
 * Instagram-via-Facebook mirror of `MessengerPages` (plan §3.2): the
 * provider list has already been narrowed to accounts the user administers
 * (`getUserInstagramAccounts`), so — unlike Messenger's pages — there is no
 * "not an admin" state, only selectable vs. already-connected.
 */
export function SelectFacebookAccounts({
  workspaceId,
  items,
}: {
  workspaceId: string
  items: ConnectPickerItem[]
}) {
  // The oRPC route, not the server action — see `MessengerPages`.
  const connectOne = (item: ConnectPickerItem) =>
    connectViaApi({
      route: CONNECT_CHANNEL_REGISTRY.instagram.connectRoute,
      body: { igId: item.id },
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
