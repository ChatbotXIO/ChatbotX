import { z } from "zod"
import {
  LanguageOptions,
  TemplateType,
} from "@/features/integration-whatsapp/message-templates/type"
import { WhatsappTemplateCategory } from "@ahachat.ai/database/types"
import { templateTextSchema } from "../templates/text/schema"
import { templateCatalogSchema } from "../templates/catalog/schema"
import { templateProductSchema } from "../templates/product/schema"
import { templateImageSchema } from "../templates/image/schema"
import { templateVideoSchema } from "../templates/video/schema"
import { templateDocumentSchema } from "../templates/document/schema"
import { templateCarouselImageSchema } from "../templates/carousel-image/schema"
import { templateCarouselVideoSchema } from "../templates/carousel-video/schema"

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
    templateType: z.nativeEnum(TemplateType),
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
