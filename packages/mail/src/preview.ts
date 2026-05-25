import mjml2html from "mjml"

const SAMPLE_VARS: Record<string, string> = {
  userName: "John Doe",
  verificationUrl: "https://example.com/verify/sample-token-abc123",
  resetPasswordUrl: "https://example.com/reset/sample-token-abc123",
  magicUrl: "https://example.com/magic/sample-token-abc123",
  brandName: "ChatbotX",
  brandLogoUrl: "https://placehold.co/150x90/f3f4f6/374151?text=Logo",
  brandUrl: "https://example.com",
}

export async function compileEmailPreview(body: string): Promise<string> {
  const substituted = body.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => SAMPLE_VARS[key] ?? `{{${key}}}`,
  )

  // check original body, not substituted, to detect MJML vs plain HTML intent
  if (body.trimStart().startsWith("<mjml")) {
    const { html, errors } = await mjml2html(substituted, {
      validationLevel: "soft",
    })
    if (errors.length > 0) {
      const messages = errors
        .map((e: { formattedMessage: string }) => e.formattedMessage)
        .join("\n")
      return `<html><body><pre style="color:red;padding:16px;font-size:13px">${messages}</pre></body></html>`
    }
    return html
  }

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px">${substituted}</body></html>`
}
