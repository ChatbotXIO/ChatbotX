import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { Context } from "@chatbotx.io/sdk"
import { integrations } from "@/integration"
import type { CreateMessageTemplateRequest } from "../schema/mutation"
import type { TemplateDocumentSchema } from "../templates/document/schema"
import type { TemplateImageSchema } from "../templates/image/schema"
import type { TemplateTextSchema } from "../templates/text/schema"
import type { TemplateVideoSchema } from "../templates/video/schema"
import { type TemplateType, templateTypes } from "../type"

export type HeaderMediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT"

export const parseComponents = async (
  ctx: Context<WhatsappAuthValue>,
  templateType: TemplateType,
  content: CreateMessageTemplateRequest["content"],
) => {
  // biome-ignore lint/suspicious/noExplicitAny: wip
  let components: any[] = []

  switch (templateType) {
    case templateTypes.enum.CarouselImage: {
      components = parseBody(components, content)
      const cards: Record<string, unknown>[] = []
      if ("cards" in content) {
        for (const card of content.cards) {
          const cardComponents = await parseComponents(
            ctx,
            templateTypes.enum.Image,
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

    case templateTypes.enum.CarouselVideo: {
      components = parseBody(components, content)
      const cards: Record<string, unknown>[] = []
      if ("cards" in content) {
        for (const card of content.cards) {
          const cardComponents = await parseComponents(
            ctx,
            templateTypes.enum.Video,
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
  components: Record<string, unknown>[],
  templateType: TemplateType,
  content: CreateMessageTemplateRequest["content"],
  ctx: Context<WhatsappAuthValue>,
) => {
  if (
    !(
      "hideHeader" in content &&
      content.hideHeader &&
      "header" in content &&
      content.header
    )
  ) {
    return components
  }
  switch (templateType) {
    case templateTypes.enum.Image:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateImageSchema).header.file,
          "IMAGE",
        ),
      )

      return components

    case templateTypes.enum.Video:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateVideoSchema).header.file,
          "VIDEO",
        ),
      )

      return components

    case templateTypes.enum.Document:
      components.push(
        await parseHeaderMedia(
          ctx,
          (content as TemplateDocumentSchema).header.file,
          "DOCUMENT",
        ),
      )

      return components

    default: {
      // biome-ignore lint/suspicious/noExplicitAny: wip
      let header: any = {
        type: "HEADER",
        format: "TEXT",
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
  const uploadedFileId = await integrations.whatsapp.actions?.uploadMedia({
    ctx,
    file,
  })
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
  components: Record<string, unknown>[],
  content: CreateMessageTemplateRequest["content"],
) => {
  // biome-ignore lint/suspicious/noExplicitAny: wip
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
  components: Record<string, unknown>[],
  content: CreateMessageTemplateRequest["content"],
) => {
  if ("showFooter" in content && content.showFooter) {
    components.push({
      type: "FOOTER",
      text: content.footer,
    })
  }

  return components
}
