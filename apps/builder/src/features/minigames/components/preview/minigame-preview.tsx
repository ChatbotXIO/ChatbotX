"use client"

import { GenericMinigamePreview } from "./generic-minigame-preview"
import {
  MINIGAME_PREVIEW_COMPONENTS,
  type MinigamePreviewProps,
} from "./minigame-preview-registry"

export function MinigamePreview(props: MinigamePreviewProps) {
  const PreviewComponent = MINIGAME_PREVIEW_COMPONENTS[props.type]
  if (PreviewComponent) {
    return <PreviewComponent {...props} />
  }
  return <GenericMinigamePreview {...props} />
}
