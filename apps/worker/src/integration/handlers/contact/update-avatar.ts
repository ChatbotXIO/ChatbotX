import { ensureContactAvatarMirrored } from "@chatbotx.io/channel-registry/media-hydration"
import type { LowJobUpdateContactAvatar } from "@chatbotx.io/worker-config"
export const updateContactAvatar = async (
  data: LowJobUpdateContactAvatar["data"],
): Promise<void> => {
  await ensureContactAvatarMirrored({
    contactInboxId: data.contactInboxId,
    workspaceId: data.workspaceId,
  })
}
