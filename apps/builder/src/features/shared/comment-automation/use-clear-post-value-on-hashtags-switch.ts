"use client"

import { useEffect, useRef } from "react"

/**
 * `post.value` holds post ids for a `postIds` target and hashtags for a
 * `hashtags` one. Switching between the two must empty it, or the chosen post
 * ids would be saved as hashtags (or the reverse). Only fires on an actual
 * switch, never on the first render, so an edit form keeps its stored list.
 */
export function useClearPostValueOnHashtagsSwitch(
  postType: string,
  clearPostValue: () => void,
) {
  const previousType = useRef(postType)
  useEffect(() => {
    if (previousType.current === postType) {
      return
    }
    const crossesHashtags =
      previousType.current === "hashtags" || postType === "hashtags"
    previousType.current = postType
    if (crossesHashtags) {
      clearPostValue()
    }
  }, [postType, clearPostValue])
}
