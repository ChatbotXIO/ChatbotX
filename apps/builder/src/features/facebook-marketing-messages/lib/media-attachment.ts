import "server-only"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { uploadAttachment } from "@chatbotx.io/integration-messenger/apis/attachment"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import type { MmContent } from "../schema/content"

/**
 * Meta's media template requires an `attachment_id` or a Facebook-hosted URL —
 * a media-library S3 URL is neither. Upload the media through the Page's
 * `/me/message_attachments` edge and stamp the returned id onto the content
 * before the campaign is created, so a failed upload leaves nothing created.
 *
 * Only the `media` template needs this: generic elements use `image_url`,
 * which accepts an arbitrary hosted URL.
 */
export async function resolveContentAttachments(input: {
  workspaceId: string
  pageId: string
  content: MmContent
  /**
   * The previously saved content, on edit — lets an unchanged URL skip the
   * upload.
   */
  previous?: MmContent
}): Promise<MmContent> {
  const { content, previous } = input
  if (content.templateType !== "media") {
    return content
  }

  const previousMedia =
    previous?.templateType === "media" ? previous.media : undefined
  if (previousMedia?.attachmentId && previousMedia.url === content.media.url) {
    return {
      ...content,
      media: { ...content.media, attachmentId: previousMedia.attachmentId },
    }
  }

  const integration = await messengerIntegrationService.findByPageId({
    workspaceId: input.workspaceId,
    pageId: input.pageId,
  })
  if (!integration) {
    throw new Error(
      `No Messenger integration for page ${input.pageId} in workspace ${input.workspaceId}`,
    )
  }

  const response = await uploadAttachment(
    integration.auth as MessengerAuthValue,
    content.media.url,
    content.mediaType,
  )
  if (!response.attachment_id) {
    throw new Error("Facebook returned no attachment id for the uploaded media")
  }

  return {
    ...content,
    media: { ...content.media, attachmentId: response.attachment_id },
  }
}
