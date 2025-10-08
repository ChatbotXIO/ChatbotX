import { WhatsappTemplateCategory } from "@aha.chat/database/types"
import { z } from "zod"
import {
  LanguageOptions,
  TemplateType,
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
      LanguageOptions.map((option) => option.value) as [string, ...string[]],
    ),
    category: z.enum([
      WhatsappTemplateCategory.MARKETING,
      WhatsappTemplateCategory.UTILITY,
    ]),
    templateType: z.enum(TemplateType),
  })
  .and(
    z.discriminatedUnion("templateType", [
      z.object({
        templateType: z.literal(TemplateType.Text),
        content: templateTextSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.Image),
        content: templateImageSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.Video),
        content: templateVideoSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.Document),
        content: templateDocumentSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.CarouselImage),
        content: templateCarouselImageSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.CarouselVideo),
        content: templateCarouselVideoSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.ViewCatalog),
        content: templateCatalogSchema,
      }),
      z.object({
        templateType: z.literal(TemplateType.ViewProduct),
        content: templateProductSchema,
      }),
    ]),
  )

export type CreateMessageTemplateRequest = z.infer<
  typeof createMessageTemplateRequest
>
