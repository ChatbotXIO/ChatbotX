/**
 * Sends the visitor on before anything below it is painted.
 *
 * This runs as the document is parsed, which is the whole point: the same
 * navigation done from a `useEffect` waits for the JS bundle and hydration, and
 * in that gap the contact sees a button they were never meant to have to press.
 *
 * Deliberately a plain inline script rather than a server redirect. A 302 would
 * carry no HTML, so Facebook's crawler would never read the `al:*` tags on this
 * page and Messenger could never launch the app natively — the one mechanism
 * that skips the webview entirely. The crawler does not execute scripts, so it
 * still sees the tags; a real visitor is moved along immediately.
 *
 * `destination` always comes from an HMAC-verified, http(s)-validated URL (see
 * `resolveOpenLinkDestination`), and is JSON-encoded with `<` escaped so it
 * cannot close this script element.
 */
export function OpenLinkRedirect({ destination }: { destination: string }) {
  const encoded = JSON.stringify(destination).replace(/</g, "\\u003c")

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: an inline script is the only thing that runs before paint
      dangerouslySetInnerHTML={{
        // The guard key carries the destination. A single shared key would hold
        // only the most recent one, so after a second `/go` link the first one's
        // back-gesture guard would no longer match and it would bounce the
        // contact straight back out.
        __html: `(function(){var d=${encoded};try{var k="chatbotx.openLink.autoNavigated:"+d;if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){}location.replace(d)})()`,
      }}
    />
  )
}
