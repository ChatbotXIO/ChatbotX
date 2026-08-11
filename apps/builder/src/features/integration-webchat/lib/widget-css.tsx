const STYLE_CLOSE_TAG_REGEX = /<\/style/gi

/**
 * Neutralizes a literal `</style` in admin-authored widget CSS before it is
 * injected via `dangerouslySetInnerHTML` by `CustomWidgetStyle` below.
 * `customCss` is superAdmin-authored, but `dangerouslySetInnerHTML` does no
 * escaping of its own — without this, `</style><script>...` in a saved value
 * would close the style element and inject arbitrary markup, turning a
 * CSS-only feature into stored XSS on the builder's own origin.
 *
 * `\3C` is the CSS escape sequence for `<`, so the replacement stays valid,
 * inert CSS rather than truncating the value.
 */
export const sanitizeWidgetCss = (css: string): string =>
  css.replace(STYLE_CLOSE_TAG_REGEX, "\\3C /style")

/**
 * Renders `IntegrationWebchat.customCss` as a scoped, server-rendered
 * `<style>` tag so it applies before first paint (no flash of unstyled
 * content, unlike the tenant-level equivalent in `tenant-settings-provider.tsx`,
 * which injects client-side via a `useEffect`).
 *
 * Security: `customCss` is gated by `requireWorkspacePermission(workspaceId,
 * "superAdmin")` on the edit page and by the matching check inside
 * `updateWebchatAction`. The widget itself renders in a cross-origin iframe,
 * so this CSS cannot execute script or reach the embedding page — the
 * residual risk (background-image exfiltration, chrome-spoofing overlays) is
 * accepted as part of letting a workspace admin style their own widget. It is
 * kept out of `WebchatClientConfig` deliberately: that DTO's allow-listed key
 * set is asserted by a test, and `customCss` is write-only data no component
 * reads, so it doesn't belong in client-held state.
 */
export const CustomWidgetStyle = ({ css }: { css: string }) => (
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized superAdmin-authored widget CSS, see module doc above
  <style dangerouslySetInnerHTML={{ __html: sanitizeWidgetCss(css) }} />
)
