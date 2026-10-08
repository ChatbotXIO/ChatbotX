/** The chat widget script, served from the tenant's app domain. */
export function buildReflinkWidgetScriptUrl(appUrl: string) {
  return `${appUrl}/chat-widget/ref-widget.js`
}

/**
 * The snippet a site owner pastes before `</body>`. Shared by the dialog and
 * the public API so both hand out the same code.
 */
export function buildReflinkWidgetEmbedCode(appUrl: string, reflinkId: string) {
  return `<script async src="${buildReflinkWidgetScriptUrl(appUrl)}" data-reflink-id="${reflinkId}"></script>`
}
