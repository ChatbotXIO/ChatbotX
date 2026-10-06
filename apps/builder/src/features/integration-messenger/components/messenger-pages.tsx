"use client"

import { ConnectPickerScreen } from "@/features/channel-connect/components/connect-picker-screen"
import { connectViaApi } from "@/features/channel-connect/lib/connect-client"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"
import { connectActionResultSchemaDefault } from "@/features/channel-connect/schema"

export function MessengerPages({
  sessionId,
  workspaceId,
  items,
}: {
  sessionId: string
  workspaceId: string
  items: ConnectPickerItem[]
}) {
  // The oRPC route, not the server action: Next serializes server actions
  // from one browser, so the batch could only ever connect one page at a
  // time (`CONNECT_CONCURRENCY` is what this buys).
  const connectOne = (item: ConnectPickerItem) =>
    connectViaApi({
      route: CONNECT_CHANNEL_REGISTRY.messenger.connectRoute,
      body: { sessionId, pageId: item.id },
      parse: (data) => connectActionResultSchemaDefault.parse(data),
      item,
    })

  return (
    <ConnectPickerScreen
      channel="messenger"
      connectOne={connectOne}
      idsFieldName="pageIds"
      items={items}
      workspaceId={workspaceId}
    />
  )
}
