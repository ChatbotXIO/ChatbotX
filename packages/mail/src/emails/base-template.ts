export type BaseEmailProps = {
  brandName: string
  brandLogoUrl: string
  brandUrl: string
  subject: string
}

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function buildSystemEmail(
  props: BaseEmailProps,
  bodyMjml: string,
): string {
  const { brandName, brandLogoUrl, brandUrl, subject } = props

  return `
<mjml>
  <mj-head>
    <mj-preview>${esc(subject)}</mj-preview>
    <mj-attributes>
      <mj-all font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif" />
      <mj-text font-size="16px" color="#3c3f44" line-height="24px" />
      <mj-button background-color="#111111" color="#ffffff" font-size="14px" font-weight="700" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#ffffff">
    <mj-section padding="32px 0 0 0">
      <mj-column>
        <mj-image width="75px" height="45px" src="${esc(brandLogoUrl)}" alt="${esc(brandName)}" href="${esc(brandUrl)}" align="left" />
      </mj-column>
    </mj-section>
    <mj-section padding="16px 0 8px 0">
      <mj-column>
        <mj-text font-size="28px" font-weight="700" color="#1d1c1d" line-height="36px" padding="0">
          ${esc(subject)}
        </mj-text>
      </mj-column>
    </mj-section>
    ${bodyMjml}
    <mj-section padding="16px 0 32px 0">
      <mj-column>
        <mj-text padding="0">Sincerely,</mj-text>
        <mj-text padding="0">${esc(brandName)} Team</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}
