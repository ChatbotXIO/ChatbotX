import type { AppLinkTargets } from "@chatbotx.io/flow-config"

type AppLinksMetaProps = {
  targets: AppLinkTargets
  appName: string
  /**
   * This page's own public URL — never the destination.
   *
   * `og:url` is a canonical declaration: point it at the destination and the
   * crawler folds this object into the destination's entry, where these `al:*`
   * tags do not belong to it any more. That silently defeats the one mechanism
   * the page exists for. Omitted when unknown, which is also correct: the
   * crawler then treats the URL it fetched as the object's own.
   */
  pageUrl?: string
}

/**
 * App Links meta tags, the one mechanism Meta documents for making a `web_url`
 * button launch a native app instead of its in-app webview.
 *
 * Rendered as JSX rather than through Next's `Metadata.other` on purpose:
 * `Metadata.other` emits `<meta name="...">`, while Meta's App Links parser only
 * reads `property="al:…"`. The App Router hoists these into `<head>`, so the
 * attribute stays `property` and the tags are where the crawler looks.
 *
 * No `al:android:url`: the spec makes it optional, and omitting it has the
 * navigating app use the target URL as the intent's data, which is what we want.
 * The `al:ios:*` block appears only when the rule supplies a custom scheme,
 * because `al:ios:url` is required and must not be an https URL — putting one
 * there is what sent iPhone users back into a browser.
 *
 * `al:web:should_fallback` must stay `true`. The spec is explicit: when no app
 * target can be opened and it is `false`, "the navigation fails" — the contact
 * taps and gets nothing at all, no app and no page. This page carries no iOS
 * target yet, so `false` here turned every iPhone tap into a dead button. `true`
 * makes a failed app launch land on this page instead, where the button is.
 */
export function AppLinksMeta({ targets, appName, pageUrl }: AppLinksMetaProps) {
  return (
    <>
      <meta content={targets.androidPackage} property="al:android:package" />
      <meta content={appName} property="al:android:app_name" />
      {targets.iosUrl ? (
        <>
          <meta content={targets.iosUrl} property="al:ios:url" />
          {targets.iosAppStoreId ? (
            <meta
              content={targets.iosAppStoreId}
              property="al:ios:app_store_id"
            />
          ) : null}
          <meta content={appName} property="al:ios:app_name" />
        </>
      ) : null}
      <meta content="true" property="al:web:should_fallback" />
      {pageUrl ? <meta content={pageUrl} property="og:url" /> : null}
      <meta content={appName} property="og:title" />
    </>
  )
}
