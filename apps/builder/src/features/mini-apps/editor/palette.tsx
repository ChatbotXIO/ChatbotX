"use client"

import {
  MINI_APP_COMPONENT_CATEGORIES,
  MINI_APP_COMPONENT_LIST,
  type MiniAppComponentDefinition,
  type MiniAppComponentType,
} from "@chatbotx.io/mini-app"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useDraggable } from "@dnd-kit/core"
import {
  AlignLeftIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CheckSquareIcon,
  ChevronDownSquareIcon,
  CircleDotIcon,
  FileTextIcon,
  GalleryHorizontalIcon,
  GitBranchIcon,
  HeadingIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  type LucideIcon,
  PilcrowIcon,
  RectangleHorizontalIcon,
  SearchIcon,
  ShieldCheckIcon,
  SplitIcon,
  SquareStackIcon,
  TagsIcon,
  TextCursorInputIcon,
  TextIcon,
  TypeIcon,
  UploadIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { categoryLabelKey, componentLabelKey } from "../lib/labels"
import type { DragSource } from "./dnd"

export const componentIcon: Record<MiniAppComponentType, LucideIcon> = {
  TextHeading: HeadingIcon,
  TextSubheading: TypeIcon,
  TextBody: TextIcon,
  TextCaption: AlignLeftIcon,
  RichText: PilcrowIcon,
  TextInput: TextCursorInputIcon,
  TextArea: FileTextIcon,
  Dropdown: ChevronDownSquareIcon,
  RadioButtonsGroup: CircleDotIcon,
  CheckboxGroup: CheckSquareIcon,
  ChipsSelector: TagsIcon,
  DatePicker: CalendarIcon,
  CalendarPicker: CalendarDaysIcon,
  OptIn: ShieldCheckIcon,
  PhotoPicker: ImageIcon,
  DocumentPicker: UploadIcon,
  Image: ImageIcon,
  ImageCarousel: GalleryHorizontalIcon,
  EmbeddedLink: LinkIcon,
  NavigationList: ListIcon,
  Footer: RectangleHorizontalIcon,
  Form: SquareStackIcon,
  If: GitBranchIcon,
  Switch: SplitIcon,
}

function PaletteItem({
  definition,
  onAdd,
}: {
  definition: MiniAppComponentDefinition
  onAdd: (type: MiniAppComponentType) => void
}) {
  const t = useTranslations()
  const source: DragSource = { kind: "palette", type: definition.type }
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `palette:${definition.type}`,
    data: source,
  })
  const Icon = componentIcon[definition.type]
  return (
    <button
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-start text-sm hover:border-primary hover:bg-primary/5",
        isDragging && "opacity-50",
      )}
      onClick={() => onAdd(definition.type)}
      ref={setNodeRef}
      title={t("miniApps.editor.paletteHint")}
      type="button"
      {...listeners}
      {...attributes}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{t(componentLabelKey[definition.type])}</span>
    </button>
  )
}

export function Palette({
  onAdd,
}: {
  onAdd: (type: MiniAppComponentType) => void
}) {
  const t = useTranslations()
  const [search, setSearch] = useState("")

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    return MINI_APP_COMPONENT_CATEGORIES.map((category) => ({
      category,
      items: MINI_APP_COMPONENT_LIST.filter(
        (definition) =>
          definition.category === category &&
          (!query ||
            t(componentLabelKey[definition.type])
              .toLowerCase()
              .includes(query) ||
            definition.type.toLowerCase().includes(query)),
      ),
    })).filter((group) => group.items.length > 0)
  }, [search, t])

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="relative">
        <SearchIcon className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="ps-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("miniApps.editor.searchComponents")}
          value={search}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 pe-2">
          {groups.map((group) => (
            <div className="flex flex-col gap-1.5" key={group.category}>
              <span className="font-medium text-muted-foreground text-xs uppercase">
                {t(categoryLabelKey[group.category])}
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {group.items.map((definition) => (
                  <PaletteItem
                    definition={definition}
                    key={definition.type}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
