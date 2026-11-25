"use client"

import { useSocialPostRealtimeSync } from "../hooks/use-social-post-realtime-sync"

/** Mounted once by the Posts layout: renders nothing, keeps every Posts page live. */
export function SocialPostsRealtimeSync() {
  useSocialPostRealtimeSync()
  return null
}
