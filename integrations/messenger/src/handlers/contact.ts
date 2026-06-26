import type { ContactHandlers } from "@chatbotx.io/sdk"
import { assignLabelToUser, removeLabelFromUser } from "../apis/label"
import {
  deleteUserPersistentMenu,
  getCustomUserSettings,
  getUserProfile,
  setUserPersistentMenu,
} from "../apis/user"
import type { MessengerAuthValue } from "../schema"

export const contactHandlers: Partial<ContactHandlers<MessengerAuthValue>> = {
  getProfile: getUserProfile,
  assignLabel: async ({ ctx, data }) => {
    await assignLabelToUser({ ctx, labelId: data.labelId, psid: data.sourceId })
  },
  removeLabel: async ({ ctx, data }) => {
    await removeLabelFromUser({
      ctx,
      labelId: data.labelId,
      psid: data.sourceId,
    })
  },
  setUserPersistentMenu: async ({ ctx, data }) =>
    await setUserPersistentMenu({
      ctx,
      psid: data.psid,
      persistentMenu: data.persistentMenu,
    }),
  deleteUserPersistentMenu: async ({ ctx, data }) =>
    await deleteUserPersistentMenu({ ctx, psid: data.psid }),
  getUserCustomSettings: async ({ ctx, data }) =>
    await getCustomUserSettings({ ctx, psid: data.psid }),
}
