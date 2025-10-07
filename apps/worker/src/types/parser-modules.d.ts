declare module "pdf-parse" {
  export default function pdfParse(buffer: Buffer): Promise<{ text: string }>
}

declare module "mammoth" {
  const mammoth: {
    extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>
  }
  export default mammoth
}

declare module "xlsx" {
  export type WorkBook = unknown
  export function read(data: Buffer, opts?: unknown): WorkBook
  export const utils: { sheet_to_csv(sheet: unknown): string }
}

declare module "html-to-text" {
  export function htmlToText(html: string, opts?: unknown): string
}

declare module "remove-markdown" {
  export default function removeMarkdown(input: string, opts?: unknown): string
}
