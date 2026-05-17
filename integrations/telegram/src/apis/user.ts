import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { getTelegramFileUrl } from "../apis/bot"
import { rescue } from "../exception"
import { createTelegramClient } from "../lib/http-client"
import type {
  TelegramApiResponse,
  TelegramAuthValue,
  TelegramChat,
} from "../schema"

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<TelegramAuthValue>
  psid: string
}): Promise<IncomingContact> =>
  rescue("getChat", async () => {
    const client = createTelegramClient(ctx.auth.secretText)
    const response = await client.get<TelegramApiResponse<TelegramChat>>(
      "getChat",
      { searchParams: { chat_id: String(psid) } },
    )
    const chat = response.result

    const contact: IncomingContact = {
      sourceId: String(psid),
      firstName: chat.first_name,
      lastName: chat.last_name,
    }

    if (chat.username) {
      const photoFileId = await getProfilePhotoFileId(ctx.auth, psid)
      if (photoFileId) {
        contact.avatar = await getTelegramFileUrl(ctx.auth, photoFileId)
      }
    }

    return contact
  })

const getProfilePhotoFileId = async (
  auth: TelegramAuthValue,
  psid: string,
): Promise<string | undefined> => {
  try {
    return await rescue("getUserProfilePhotos", async () => {
      const client = createTelegramClient(auth.secretText)
      const response = await client.get<
        TelegramApiResponse<{ photos: { file_id: string }[][] }>
      >("getUserProfilePhotos", {
        searchParams: { user_id: String(psid), limit: "1" },
      })
      return response.result.photos[0]?.[0]?.file_id
    })
  } catch {
    return
  }
}
