const VIDEO_MEDIA_TYPE = "VIDEO"

/**
 * The image a post picker card shows. For a video, `media_url` is the .mp4
 * itself, which `next/image` cannot render — only `thumbnail_url` is an
 * image, and a video without one shows no image rather than a broken one.
 */
export function resolvePostPreviewImage(media: {
  media_type?: string
  media_url?: string
  thumbnail_url?: string
}): string | undefined {
  if (media.media_type?.toUpperCase() === VIDEO_MEDIA_TYPE) {
    return media.thumbnail_url
  }
  return media.media_url ?? media.thumbnail_url
}
