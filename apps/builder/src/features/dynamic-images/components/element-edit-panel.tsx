"use client"

import type { DynamicImageElement } from "@chatbotx.io/database/partials"
import { DynamicImageImageLayerEditForm } from "./elements/image-layer"
import { DynamicImageQrCodeLayerEditForm } from "./elements/qr-code-layer"
import { DynamicImageTextLayerEditForm } from "./elements/text-layer"
import type { DynamicImageElementPatch } from "./types"

type DynamicImageElementEditPanelProps = {
  workspaceId: string
  element: DynamicImageElement
  onChange: (patch: DynamicImageElementPatch) => void
}

export function DynamicImageElementEditPanel(
  props: DynamicImageElementEditPanelProps,
) {
  const { workspaceId, element, onChange } = props

  if (element.type === "image") {
    return (
      <DynamicImageImageLayerEditForm
        element={element}
        key={element.id}
        onChange={onChange}
        workspaceId={workspaceId}
      />
    )
  }

  if (element.type === "text") {
    return (
      <DynamicImageTextLayerEditForm
        element={element}
        key={element.id}
        onChange={onChange}
      />
    )
  }

  return (
    <DynamicImageQrCodeLayerEditForm
      element={element}
      key={element.id}
      onChange={onChange}
      workspaceId={workspaceId}
    />
  )
}
