import { getLocale } from "next-intl/server"
import {
  buildProductImportTemplate,
  PRODUCT_IMPORT_TEMPLATE_MIME_TYPE,
  productImportTemplateFileName,
  resolveProductImportTemplateLocale,
} from "@/features/products/lib/product-import-template"

export async function GET() {
  const locale = resolveProductImportTemplateLocale(await getLocale())
  const template = await buildProductImportTemplate(locale)

  return new Response(new Uint8Array(template), {
    headers: {
      "Content-Type": PRODUCT_IMPORT_TEMPLATE_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${productImportTemplateFileName(locale)}"`,
      "Cache-Control": "private, max-age=300",
    },
  })
}
