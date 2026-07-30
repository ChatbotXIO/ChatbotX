import {
  createProductImportTemplate,
  type ProductTemplateLabels,
} from "@chatbotx.io/imports"
import { getLocale, getTranslations } from "next-intl/server"

export async function GET() {
  const locale = await getLocale()
  const supportedLocale = locale === "vi" ? "vi" : "en"
  const t = await getTranslations({
    locale: supportedLocale,
    namespace: "productImport.template",
  })
  const labels: ProductTemplateLabels = {
    name: t("name"),
    sku: t("sku"),
    price: t("price"),
    discount: t("discount"),
    shortDescription: t("shortDescription"),
    category: t("category"),
    vendor: t("vendor"),
    inventoryQuantity: t("inventoryQuantity"),
    imageUrl: t("imageUrl"),
    productUrl: t("productUrl"),
  }
  const template = await createProductImportTemplate({
    sheetName: t("sheetName"),
    labels,
    examples: [
      {
        name: t("exampleOne.name"),
        sku: "SKU-001",
        price: 199_000,
        discount: 10,
        shortDescription: t("exampleOne.description"),
        category: t("exampleOne.category"),
        vendor: t("exampleOne.vendor"),
        inventoryQuantity: 25,
        imageUrl: "https://example.com/product-one.jpg",
        productUrl: "https://example.com/products/product-one",
      },
      {
        name: t("exampleTwo.name"),
        sku: "SKU-002",
        price: 99_000,
        discount: 0,
        shortDescription: t("exampleTwo.description"),
        category: t("exampleTwo.category"),
        vendor: t("exampleTwo.vendor"),
        inventoryQuantity: 50,
        imageUrl: "https://example.com/product-two.jpg",
        productUrl: "https://example.com/products/product-two",
      },
    ],
  })

  return new Response(new Uint8Array(template), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="product-import-${supportedLocale}.xlsx"`,
      "Cache-Control": "private, max-age=300",
    },
  })
}
