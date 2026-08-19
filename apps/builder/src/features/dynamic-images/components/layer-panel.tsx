"use client"

import type { DynamicImageElement } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@chatbotx.io/ui/components/ui/sortable"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  GripVerticalIcon,
  ImageIcon,
  QrCodeIcon,
  TrashIcon,
  TypeIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { DynamicImageElementEditPanel } from "./element-edit-panel"
import type { DynamicImageElementPatch } from "./types"

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  if (moved !== undefined) {
    next.splice(toIndex, 0, moved)
  }
  return next
}

function getLayerTypeLabelKey(element: DynamicImageElement): string {
  if (element.type === "image") {
    return "dynamicImages.editor.layerNameImage"
  }
  if (element.type === "text") {
    return "dynamicImages.editor.layerNameText"
  }
  return "dynamicImages.editor.layerNameQrCode"
}

function getLayerLabel(
  element: DynamicImageElement,
  index: number,
  t: ReturnType<typeof useTranslations>,
): string {
  if (element.type === "text" && element.text.trim().length > 0) {
    return element.text.trim()
  }

  return `${t(getLayerTypeLabelKey(element))} #${index + 1}`
}

function getLayerIcon(element: DynamicImageElement) {
  if (element.type === "image") {
    return ImageIcon
  }

  if (element.type === "text") {
    return TypeIcon
  }

  return QrCodeIcon
}

type DynamicImageLayerPanelProps = {
  workspaceId: string
  elements: DynamicImageElement[]
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onReorder: (elements: DynamicImageElement[]) => void
  onRemove: (id: string) => void
  onUpdateElement: (id: string, patch: DynamicImageElementPatch) => void
}

export function DynamicImageLayerPanel(props: DynamicImageLayerPanelProps) {
  const {
    workspaceId,
    elements,
    selectedElementId,
    onSelectElement,
    onReorder,
    onRemove,
    onUpdateElement,
  } = props
  const t = useTranslations()

  // The popover only opens from an explicit click on a layer row — selecting
  // an element via the canvas must still highlight its row (via
  // `selectedElementId`) without forcing its edit popover open. Tracking
  // "which popover is open" separately from "which element is selected"
  // keeps those two triggers independent; the effect below closes the
  // popover whenever selection changes to something else (e.g. a canvas
  // click on a different element), so a stale popover never lingers open
  // for an element that's no longer selected.
  const [openElementId, setOpenElementId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedElementId !== openElementId) {
      setOpenElementId(null)
    }
  }, [selectedElementId, openElementId])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-3">
      <p className="font-medium text-sm">{t("dynamicImages.editor.layers")}</p>

      {elements.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("dynamicImages.editor.noLayers")}
        </p>
      ) : (
        <Sortable
          getItemValue={(element: DynamicImageElement) => element.id}
          onMove={({ activeIndex, overIndex }) =>
            onReorder(moveArrayItem(elements, activeIndex, overIndex))
          }
          value={elements}
        >
          <SortableContent>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {elements.map((element, index) => {
                const Icon = getLayerIcon(element)
                const isSelected = element.id === selectedElementId

                return (
                  <Popover
                    key={element.id}
                    onOpenChange={(open) => {
                      setOpenElementId(open ? element.id : null)
                      onSelectElement(open ? element.id : null)
                    }}
                    open={element.id === openElementId}
                  >
                    <SortableItem
                      render={
                        <PopoverTrigger
                          render={
                            <div
                              className={cn(
                                "flex items-center gap-2 rounded-md border border-transparent p-2 text-sm hover:bg-accent",
                                isSelected && "border-primary bg-accent",
                              )}
                              role="presentation"
                            >
                              <SortableItemHandle
                                render={
                                  <Button size="icon" variant="ghost">
                                    <GripVerticalIcon className="size-4" />
                                  </Button>
                                }
                              />
                              <div className="flex flex-1 items-center gap-2 truncate">
                                <Icon className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">
                                  {getLayerLabel(element, index, t)}
                                </span>
                              </div>
                              <Button
                                aria-label={t(
                                  "dynamicImages.editor.deleteLayer",
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onRemove(element.id)
                                }}
                                size="icon"
                                variant="ghost"
                              >
                                <TrashIcon className="size-4" />
                              </Button>
                            </div>
                          }
                        />
                      }
                      value={element.id}
                    />
                    <PopoverContent align="start" className="w-80" side="right">
                      <DynamicImageElementEditPanel
                        element={element}
                        onChange={(patch) => onUpdateElement(element.id, patch)}
                        workspaceId={workspaceId}
                      />
                    </PopoverContent>
                  </Popover>
                )
              })}
            </div>
          </SortableContent>
        </Sortable>
      )}
    </div>
  )
}
