import type {
  ContactHandlers,
  Context,
  IncomingContact,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { API_URL } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { FacebookUserProfile, MessengerAuthValue } from "../schema"

export const getUserProfile: ContactHandlers<MessengerAuthValue>["getProfile"] =
  (props) => {
    const {
      data: { sourceId },
      ctx,
    } = props
    const endpoint = `${API_URL}/${ctx.auth.metadata.version}/${sourceId}`

    return rescue(endpoint, async () => {
      const response = await facebookGraphClient.get<FacebookUserProfile>(
        `${ctx.auth.metadata.version}/${sourceId}`,
        {
          headers: {
            Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
          },
        },
      )

      const result: IncomingContact = {
        sourceId,
        firstName: response.first_name,
        lastName: response.last_name,
      }

      if (response.profile_pic) {
        try {
          result.avatar = await getContactProfilePicture({
            ctx,
            pictureUrl: response.profile_pic,
          })
        } catch (error) {
          logger.error(error, "getContactProfilePicture error")
        }
      }

      return result
    })
  }

const getContactProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<MessengerAuthValue>
  pictureUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(pictureUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const originPath = `public/space/${ctx.storagePrefix}/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
