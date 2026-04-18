import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { getTelegramFileUrl } from "../apis/bot"
import { createTelegramClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  TelegramApiResponse,
  TelegramAuthValue,
  TelegramChat,
} from "../schema"

export const getUserProfile = async ({
  ctx,
  psid,
}: {
  ctx: Context<TelegramAuthValue>
  psid: string
}): Promise<IncomingContact> => {
  const client = createTelegramClient(ctx.auth.secretText)
  try {
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
  } catch (error) {
    logger.error(error, "getUserProfile error")
    return { sourceId: String(psid) }
  }
}

const getProfilePhotoFileId = async (
  auth: TelegramAuthValue,
  psid: string,
): Promise<string | undefined> => {
  const client = createTelegramClient(auth.secretText)
  try {
    const response = await client.get<
      TelegramApiResponse<{ photos: { file_id: string }[][] }>
    >("getUserProfilePhotos", {
      searchParams: { user_id: String(psid), limit: "1" },
    })
    return response.result.photos[0]?.[0]?.file_id
  } catch {
    return
  }
}
