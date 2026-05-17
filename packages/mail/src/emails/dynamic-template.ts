import { z } from "zod"

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export const mailElementTypes = z.enum([
  "heading",
  "text",
  "image",
  "button",
  "spacing",
  "code",
  "line",
])
export type MailElementType = z.infer<typeof mailElementTypes>

export const mailElementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([
      mailElementTypes.enum.heading,
      mailElementTypes.enum.text,
      mailElementTypes.enum.code,
    ]),
    text: z.string(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.image]),
    url: z.string().optional(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.line, mailElementTypes.enum.spacing]),
  }),
  z.object({
    type: z.literal(mailElementTypes.enum.button),
    label: z.string().optional(),
    url: z.string().optional(),
  }),
])
export type MailElementSchema = z.infer<typeof mailElementSchema>

export const elements = z.array(mailElementSchema)

export type DynamicEmailProps = {
  brandName: string
  subject: string
  preheader: string
  elements: MailElementSchema[]
}

export function elementToMjml(element: MailElementSchema): string {
  switch (element.type) {
    case "heading":
      return `
        <mj-section>
          <mj-column>
            <mj-raw>
              <div style="font-size:20px;font-weight:700;color:#1d1c1d;line-height:28px;padding:0;">
                ${escapeHtml(element.text)}
              </div>
            </mj-raw>
          </mj-column>
        </mj-section>`

    case "text":
      return `
        <mj-section>
          <mj-column>
            <mj-raw>
              <div style="font-size:16px;color:#3c3f44;line-height:24px;padding:0;">
                ${escapeHtml(element.text)}
              </div>
            </mj-raw>
          </mj-column>
        </mj-section>`

    case "code":
      return `
        <mj-section>
          <mj-column>
            <mj-raw>
              <div style="font-family:monospace,'Courier New';font-size:14px;color:#3c3f44;line-height:22px;background-color:#f4f4f5;padding:12px;">
                ${escapeHtml(element.text).replace(/\n/g, "<br />")}
              </div>
            </mj-raw>
          </mj-column>
        </mj-section>`

    case "image":
      return element.url
        ? `
        <mj-section>
          <mj-column>
            <mj-image src="${escapeHtml(element.url)}" alt="" />
          </mj-column>
        </mj-section>`
        : ""

    case "button":
      return element.url
        ? `
        <mj-section>
          <mj-column>
            <mj-button background-color="#111111" color="#ffffff" font-size="14px"
              font-weight="700" border-radius="4px" href="${escapeHtml(element.url)}">
              ${escapeHtml(element.label ?? "Click here")}
            </mj-button>
          </mj-column>
        </mj-section>`
        : ""

    case "line":
      return `
        <mj-section>
          <mj-column>
            <mj-divider border-color="#e8e8e8" border-width="1px" />
          </mj-column>
        </mj-section>`

    case "spacing":
      return `<mj-section padding="12px 0" />`

    default:
      return ""
  }
}

export function buildMjmlTemplate(props: DynamicEmailProps): string {
  const { elements: els } = props
  const bodyElements = els.map(elementToMjml).join("\n")

  return `
    <mjml>
      <mj-head>
        <mj-preview>
          ${escapeHtml(props.preheader)}
        </mj-preview>
      </mj-head>
      <mj-body background-color="#ffffff">
        ${bodyElements}

        <mj-section>
          <mj-column>
            <mj-text font-size="12px" color="#888" padding="16px 0 0 0">⚡ Built with chatbotx.io</mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `
}
