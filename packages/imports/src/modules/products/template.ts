import type { ProductImportField } from "@chatbotx.io/database/partials"
import ExcelJS from "exceljs"

export type ProductTemplateLabels = Record<ProductImportField, string>

const FIELDS: ProductImportField[] = [
  "name",
  "sku",
  "price",
  "discount",
  "shortDescription",
  "category",
  "vendor",
  "inventoryQuantity",
  "imageUrl",
]

export const createProductImportTemplate = async (input: {
  sheetName: string
  labels: ProductTemplateLabels
  examples: Record<ProductImportField, string | number>[]
}): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(input.sheetName)
  worksheet.addRow(FIELDS.map((field) => input.labels[field]))
  for (const example of input.examples) {
    worksheet.addRow(FIELDS.map((field) => example[field]))
  }
  worksheet.getRow(1).font = { bold: true }
  worksheet.columns = FIELDS.map(() => ({ width: 24 }))
  const data = await workbook.xlsx.writeBuffer()
  return Buffer.from(data)
}
