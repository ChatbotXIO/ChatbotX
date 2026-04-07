import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { findIntegrationZalo } from "@/features/integration-zalo/queries"
import type { ListChannelsResponse } from "../schema/resource"

export const listChannels = async (
  workspaceId: string,
): Promise<ListChannelsResponse> => {
  const [messenger, whatsapps, zalo, webchats] = await Promise.all([
    findIntegrationMessenger({ workspaceId }).catch(() => null),
    listIntegrationWhatsapps({ workspaceId }),
    findIntegrationZalo({ workspaceId }),
    listIntegrationWebchats({ workspaceId }),
  ])

  const data = [
    ...(messenger
      ? [
          {
            id: String(messenger.id),
            name: messenger.name,
            type: "messenger" as const,
          },
        ]
      : []),
    ...whatsapps.data.map((item) => ({
      id: String(item.id),
      name: item.name,
      type: "whatsapp" as const,
    })),
    ...(zalo
      ? [{ id: String(zalo.id), name: zalo.name, type: "zalo" as const }]
      : []),
    ...webchats.data.map((item) => ({
      id: String(item.id),
      name: item.name,
      type: "webchat" as const,
    })),
  ]

  return { data }
}
