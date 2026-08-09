/**
 * Parallel-route fallback for the implicit `children` slot.
 *
 * `channels/layout.tsx` renders only its named slots (@whatsapp, @messenger,
 * @instagram, …) and never uses `children`, and there is no `channels/page.tsx`.
 * On a hard navigation (an OAuth callback redirect, a pasted URL, or a refresh)
 * Next.js must resolve every parallel slot — including `children` — from the URL.
 * Without this `default.tsx` the `children` slot has no match and Next.js returns
 * a 404 for the whole route, even though soft in-app navigation works.
 *
 * The layout ignores `children`, so rendering nothing here is correct.
 */
export default function ChannelsDefault() {
  return null
}
