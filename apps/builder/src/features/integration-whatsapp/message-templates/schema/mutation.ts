import { whatsappTemplateCategories } from "@chatbotx.io/database/partials"
import { z } from "zod"
import {
  languageOptions,
  templateTypes,
} from "@/features/integration-whatsapp/message-templates/type"
import { templateCarouselImageSchema } from "../templates/carousel-image/schema"
import { templateCarouselVideoSchema } from "../templates/carousel-video/schema"
import { templateCatalogSchema } from "../templates/catalog/schema"
import { templateDocumentSchema } from "../templates/document/schema"
import { templateImageSchema } from "../templates/image/schema"
import { templateProductSchema } from "../templates/product/schema"
import { templateTextSchema } from "../templates/text/schema"
import { templateVideoSchema } from "../templates/video/schema"

export const createMessageTemplateRequest = z
  .object({
    name: z.string().min(1).max(512),
    language: z.enum(
      languageOptions.map((option) => option.value) as [string, ...string[]],
    ),
    category: whatsappTemplateCategories,
    templateType: templateTypes,
  })
  .and(
    z.discriminatedUnion("templateType", [
      z.object({
        templateType: z.literal(templateTypes.enum.Text),
        content: templateTextSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.Image),
        content: templateImageSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.Video),
        content: templateVideoSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.Document),
        content: templateDocumentSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.CarouselImage),
        content: templateCarouselImageSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.CarouselVideo),
        content: templateCarouselVideoSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.ViewCatalog),
        content: templateCatalogSchema,
      }),
      z.object({
        templateType: z.literal(templateTypes.enum.ViewProduct),
        content: templateProductSchema,
      }),
    ]),
  )

export type CreateMessageTemplateRequest = z.infer<
  typeof createMessageTemplateRequest
>
