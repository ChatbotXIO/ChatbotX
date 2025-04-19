import { integrations } from "@/integration"
import type { CreateMessageTemplateRequest } from "../schemas/create-message-templates-schema"
import { TemplateType } from "../type"
import type { Context } from "@ahachat.ai/sdk"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import type { TemplateImageSchema } from "../templates/image/schema"
import type { TemplateVideoSchema } from "../templates/video/schema"
import type { TemplateDocumentSchema } from "../templates/document/schema"
import type { TemplateTextSchema } from "../templates/text/schema"

export type HeaderMediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT"

export const parseComponents = async (
  ctx: Context<WhatsappAuthValue>,
  templateType: TemplateType,
  content: CreateMessageTemplateRequest["content"],
) => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  let components: any[] = []

  switch (templateType) {
    case TemplateType.CarouselImage: {
      components = parseBody(components, content)
      const cards = []
      if ("cards" in content) {
        for (const card of content.cards) {
          const cardComponents = await parseComponents(
            ctx,
            TemplateType.Image,
            card,
          )
          cards.push({ components: cardComponents })
        }
      }

      components.push({
        type: "CAROUSEL",
        cards,
      })
      return components
    }

    case TemplateType.CarouselVideo: {
      components = parseBody(components, content)
      const cards = []
      if ("cards" in content) {
        for (const card of content.cards) {
          const cardComponents = await parseComponents(
            ctx,
            TemplateType.Video,
            card,
          )
          cards.push({ components: cardComponents })
        }
      }
      components.push({
        type: "CAROUSEL",
        cards,
      })
      return components
    }

    default:
      components = await parseHeader(components, templateType, content, ctx)
      components = parseBody(components, content)
      components = parseFooter(components, content)
      if ("buttons" in content && content.buttons.length) {
        components.push({
          type: "BUTTONS",
          buttons: content.buttons,
        })
      }

      return components
  }
}

export const parseHeader = async (
  components: Array<Record<string, unknown>>,
  templateType: TemplateType,
  content: CreateMessageTemplateRequest["content"],
  ctx: Context<WhatsappAuthValue>,
) => {
  if (!("showHeader" in content) || !("header" in content)) {
    return components
  }
  switch (templateType) {
    case TemplateType.Image:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateImageSchema).header.file,
          "IMAGE",
        ),
      )

      return components

    case TemplateType.Video:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateVideoSchema).header.file,
          "VIDEO",
        ),
      )

      return components

    case TemplateType.Document:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateDocumentSchema).header.file,
          "DOCUMENT",
        ),
      )

      return components

    default: {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      let header: any = {
        type: "HEADER",
        text: (content as TemplateTextSchema).header.text,
      }

      if ((content as TemplateTextSchema).header.variables?.length) {
        header = {
          ...header,
          example: {
            header_text: content.body.variables,
          },
        }
      }
      components.push(header)

      return components
    }
  }
}

export const parseHeaderMedia = async (
  ctx: Context<WhatsappAuthValue>,
  file: File,
  format: HeaderMediaFormat,
): Promise<{
  type: "HEADER"
  format: HeaderMediaFormat
  example: {
    header_handle: string[]
  }
}> => {
  const uploadedFileId =
    await integrations.WHATSAPP.integration.actions?.uploadMedia({ ctx, file })
  if (!uploadedFileId) {
    throw new Error("Upload file can't upload")
  }
  return {
    type: "HEADER",
    format,
    example: {
      header_handle: [uploadedFileId],
    },
  }
}

export const parseBody = (
  components: Array<Record<string, unknown>>,
  content: CreateMessageTemplateRequest["content"],
) => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  let body: any = {
    type: "BODY",
    text: content.body.text,
  }

  if (content.body.variables.length) {
    body = {
      ...body,
      example: {
        body_text: [content.body.variables],
      },
    }
  }

  components.push(body)

  return components
}

export const parseFooter = (
  components: Array<Record<string, unknown>>,
  content: CreateMessageTemplateRequest["content"],
) => {
  if ("showFooter" in content) {
    components.push({
      type: "FOOTER",
      text: content.footer,
    })
  }

  return components
}

export const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]+/g, "")
    .replace(/__+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
}
