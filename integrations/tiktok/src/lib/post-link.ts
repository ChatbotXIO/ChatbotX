/**
 * The public URL of an owned video, without a network call.
 *
 * TikTok's real permalink is `share_url` from `business/videos/list/`, which is
 * reachable now that `video.list` is approved — but only for a connection whose
 * owner has re-authorized since, so this stays the fallback for every other one.
 * It is derivable because a comment webhook only ever concerns a video on the
 * connected account: `@<username>/video/<video id>`.
 *
 * The username is taken from `auth.metadata.username`, which the token exchange
 * stamps and every refresh re-stamps, so it stays correct across a rename.
 */
export const buildTiktokVideoUrl = (
  username: string | undefined,
  videoId: string,
): string | undefined =>
  username ? `https://www.tiktok.com/@${username}/video/${videoId}` : undefined
