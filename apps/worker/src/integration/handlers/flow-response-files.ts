import {
  getWhatsappFlowResponse,
  type MessageWhatsappFlowResponseEntity,
} from "@chatbotx.io/sdk"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { ResolvedFlowFile } from "@chatbotx.io/worker-config"

type StoredAttachmentRef = { sourceId: string | null; originPath: string }

/**
 * The stored files of a form response's file answers with their public URLs,
 * by response key, matched to their attachments on the provider media id; a
 * file without a stored copy is left out. A key whose files all failed stays,
 * empty, so the answer still reads as a file answer. Undefined when the
 * response has no files.
 */
export const resolveFlowFiles = (props: {
  response: Pick<MessageWhatsappFlowResponseEntity, "files"> | undefined
  attachments: readonly StoredAttachmentRef[]
  storageUrl: string
}): Record<string, ResolvedFlowFile[]> | undefined => {
  const answers = props.response?.files
  if (!answers || Object.keys(answers).length === 0) {
    return
  }
  const originPathByMediaId = new Map(
    props.attachments.flatMap(({ sourceId, originPath }) =>
      sourceId ? [[sourceId, originPath] as const] : [],
    ),
  )
  return Object.fromEntries(
    Object.entries(answers).map(([key, files]) => [
      key,
      files.flatMap((file) => {
        const originPath = originPathByMediaId.get(file.mediaId)
        return file.status === "stored" && originPath
          ? [
              {
                mediaId: file.mediaId,
                fileName: file.fileName,
                mimeType: file.mimeType,
                size: file.size,
                url: getPublicFileUrl(originPath, props.storageUrl),
              },
            ]
          : []
      }),
    ]),
  )
}

const hasStoredFile = (
  response: Pick<MessageWhatsappFlowResponseEntity, "files">,
): boolean =>
  Object.values(response.files ?? {}).some((files) =>
    files.some((file) => file.status === "stored"),
  )

/**
 * The flow files of a saved message, from the saved copy itself: its file
 * statuses and its attachment rows always go together, and they are what the
 * inbox shows. Saving a redelivered message that brought no attachment returns
 * the existing row without its attachments, so they are loaded only then.
 */
export const resolveMessageFlowFiles = async (props: {
  message: {
    contentAttributes: unknown
    attachments: readonly StoredAttachmentRef[]
  }
  storageUrl: string
  loadAttachments: () => Promise<readonly StoredAttachmentRef[]>
}): Promise<Record<string, ResolvedFlowFile[]> | undefined> => {
  const response = getWhatsappFlowResponse(props.message.contentAttributes)
  if (!response?.files) {
    return
  }
  const attachments =
    props.message.attachments.length === 0 && hasStoredFile(response)
      ? await props.loadAttachments()
      : props.message.attachments
  return resolveFlowFiles({
    response,
    attachments,
    storageUrl: props.storageUrl,
  })
}
