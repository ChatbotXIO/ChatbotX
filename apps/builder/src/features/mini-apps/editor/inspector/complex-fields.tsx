// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
"use client"
import {
  collectInputNames,
  MINI_APP_MAX_IMAGE_BASE64_LENGTH,
  MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH,
  type MiniAppAction,
  type MiniAppActionName,
  type MiniAppNode,
  type MiniAppOption,
  miniAppActionSchema,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useWorkspaceId } from "@/hooks/routing"
import { loadMediaLibraryImageAction } from "../../actions/load-media-library-image.action"
import { toImageSrc } from "../../lib/image-src"
import { imageFileToBase64 } from "../../lib/image-to-base64"
import { actionLabelKey, type MiniAppPropertyKey } from "../../lib/labels"
import { useMiniAppEditor } from "../editor-context"
import { FieldRow, useInspector } from "./fields"

const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) {
    next.splice(to, 0, moved)
  }
  return next
}

const base64ToFile = (base64: string, mimeType: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], "image", { type: mimeType })
}

/**
 * Picks an image from the workspace media library (where new images can also
 * be uploaded), then shrinks it in the browser to fit inline in Flow JSON.
 */
function ImagePicker({
  value,
  maxLength,
  onChange,
}: {
  value?: string
  maxLength: number
  onChange: (base64: string | undefined) => void
}) {
  const t = useTranslations("miniApps.inspector")
  const workspaceId = useWorkspaceId()
  const src = toImageSrc(value)
  const { executeAsync, isPending } = useAction(
    loadMediaLibraryImageAction.bind(null, workspaceId),
  )

  const applyLibraryImage = async (fileId: string) => {
    const result = await executeAsync({ fileId })
    if (!result?.data) {
      toast.error(result?.serverError ?? t("imageLoadFailed"))
      return
    }
    const base64 = await imageFileToBase64(
      base64ToFile(result.data.base64, result.data.mimeType),
      maxLength,
    )
    if (base64) {
      onChange(base64)
    } else {
      toast.error(t("imageTooLarge"))
    }
  }

  return (
    <div className="flex items-center gap-2">
      {src ? (
        // biome-ignore lint/performance/noImgElement: inline base64 preview
        <img
          alt=""
          className="size-12 rounded border object-cover"
          height={48}
          src={src}
          width={48}
        />
      ) : null}
      <MediaLibraryTrigger
        onSelect={(file) => {
          applyLibraryImage(file.id).catch(() =>
            toast.error(t("imageLoadFailed")),
          )
        }}
        workspaceId={workspaceId}
      >
        <Button disabled={isPending} size="sm" type="button" variant="outline">
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ImagePlusIcon className="size-4" />
          )}
          {t("uploadImage")}
        </Button>
      </MediaLibraryTrigger>
      {value ? (
        <Button
          onClick={() => onChange(undefined)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

export function ImageProp({
  propKey = "src",
}: {
  propKey?: MiniAppPropertyKey
}) {
  const { props, setProp } = useInspector()
  return (
    <FieldRow propKey={propKey}>
      <ImagePicker
        maxLength={MINI_APP_MAX_IMAGE_BASE64_LENGTH}
        onChange={(base64) => setProp(propKey, base64)}
        value={
          typeof props[propKey] === "string"
            ? (props[propKey] as string)
            : undefined
        }
      />
    </FieldRow>
  )
}

function ItemControls({
  index,
  count,
  onMove,
  onRemove,
  minItems = 1,
}: {
  index: number
  count: number
  onMove: (to: number) => void
  onRemove: () => void
  minItems?: number
}) {
  const t = useTranslations("miniApps.inspector")
  return (
    <div className="flex items-center">
      <Button
        aria-label={t("moveUp")}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowUpIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={t("moveDown")}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowDownIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={t("removeItem")}
        disabled={count <= minItems}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}

const nextItemId = (prefix: string, existing: { id?: unknown }[]) => {
  const taken = new Set(existing.map((item) => String(item.id)))
  let counter = existing.length + 1
  while (taken.has(`${prefix}_${counter}`)) {
    counter++
  }
  return `${prefix}_${counter}`
}

/** Editor for `data-source` (Dropdown, radios, checkboxes, chips). */
export function OptionsProp({ withImages = false }: { withImages?: boolean }) {
  const t = useTranslations("miniApps.inspector")
  const tRoot = useTranslations()
  const { props, setProp } = useInspector()
  const options = (
    Array.isArray(props["data-source"]) ? props["data-source"] : []
  ) as MiniAppOption[]
  const update = (next: MiniAppOption[]) => setProp("data-source", next)
  const patch = (index: number, change: Partial<MiniAppOption>) =>
    update(
      options.map((option, position) =>
        position === index ? { ...option, ...change } : option,
      ),
    )

  return (
    <FieldRow propKey="data-source">
      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <div
            className="flex flex-col gap-1.5 rounded-md border p-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: ids are editable; keying by them would remount the row on every keystroke
            key={index}
          >
            <div className="flex items-center gap-1">
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, { title: event.target.value })
                }
                placeholder={t("optionTitle")}
                value={option.title}
              />
              <ItemControls
                count={options.length}
                index={index}
                onMove={(to) => update(moveItem(options, index, to))}
                onRemove={() =>
                  update(options.filter((_, position) => position !== index))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                className="h-8 font-mono text-xs"
                onChange={(event) => patch(index, { id: event.target.value })}
                placeholder={t("optionId")}
                value={option.id}
              />
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, { description: event.target.value || undefined })
                }
                placeholder={tRoot("miniApps.properties.description")}
                value={option.description ?? ""}
              />
            </div>
            {withImages ? (
              <ImagePicker
                maxLength={MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH}
                onChange={(image) => patch(index, { image })}
                value={option.image}
              />
            ) : null}
          </div>
        ))}
        <Button
          onClick={() =>
            update([
              ...options,
              {
                id: nextItemId("option", options),
                title: `${tRoot("miniApps.defaults.option")} ${options.length + 1}`,
              },
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
          {t("addOption")}
        </Button>
      </div>
    </FieldRow>
  )
}

type ImageItem = { src?: string; "alt-text"?: string }

export function CarouselImagesProp() {
  const t = useTranslations("miniApps.inspector")
  const { props, setProp } = useInspector()
  const images = (
    Array.isArray(props.images) ? props.images : []
  ) as ImageItem[]
  const update = (next: ImageItem[]) => setProp("images", next)
  return (
    <FieldRow propKey="images">
      <div className="flex flex-col gap-2">
        {images.map((image, index) => (
          <div
            className="flex items-center justify-between gap-2 rounded-md border p-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: images have no id
            key={index}
          >
            <ImagePicker
              maxLength={MINI_APP_MAX_IMAGE_BASE64_LENGTH}
              onChange={(src) =>
                update(
                  images.map((item, position) =>
                    position === index ? { ...item, src } : item,
                  ),
                )
              }
              value={image.src}
            />
            <ItemControls
              count={images.length}
              index={index}
              onMove={(to) => update(moveItem(images, index, to))}
              onRemove={() =>
                update(images.filter((_, position) => position !== index))
              }
            />
          </div>
        ))}
        {images.length < 3 ? (
          <Button
            onClick={() => update([...images, { src: images[0]?.src }])}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon className="size-4" />
            {t("addImage")}
          </Button>
        ) : null}
      </div>
    </FieldRow>
  )
}

const readAction = (value: unknown): MiniAppAction | undefined => {
  const parsed = miniAppActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Picks an `on-click-action`; `navigate` targets a screen by its stable key. */
function ActionPicker({
  value,
  allowed,
  optional,
  screenKey,
  onChange,
}: {
  value: unknown
  allowed: readonly MiniAppActionName[]
  optional: boolean
  screenKey: string
  onChange: (action: MiniAppAction | undefined) => void
}) {
  const t = useTranslations()
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const action = readAction(value)
  const NONE = "none"
  const actionItems = [
    ...(optional
      ? [{ value: NONE, label: t("miniApps.inspector.noAction") }]
      : []),
    ...allowed.map((name) => ({ value: name, label: t(actionLabelKey[name]) })),
  ]
  const targets = screens.filter((screen) => screen.key !== screenKey)
  const screenItems = targets.map((screen) => ({
    value: screen.key,
    label: screen.title ? `${screen.title} (${screen.id})` : screen.id,
  }))

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={actionItems}
        onValueChange={(name) => {
          if (name === "navigate") {
            onChange(
              targets[0]
                ? { name: "navigate", next: targets[0].key }
                : undefined,
            )
          } else if (name === "complete") {
            onChange({ name: "complete" })
          } else if (name === "open_url") {
            onChange({ name: "open_url", url: "https://" })
          } else {
            onChange(undefined)
          }
        }}
        value={action?.name ?? (optional ? NONE : "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("miniApps.inspector.chooseAction")} />
        </SelectTrigger>
        <SelectContent>
          {actionItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {action?.name === "navigate" && targets.length > 0 ? (
        <Select
          items={screenItems}
          onValueChange={(next) =>
            onChange({ name: "navigate", next: String(next) })
          }
          value={action.next}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {screenItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {action?.name === "navigate" && targets.length === 0 ? (
        <span className="text-muted-foreground text-xs">
          {t("miniApps.inspector.noOtherScreen")}
        </span>
      ) : null}
      {action?.name === "open_url" ? (
        <Input
          onChange={(event) =>
            onChange({ name: "open_url", url: event.target.value })
          }
          placeholder="https://"
          value={action.url}
        />
      ) : null}
      {action?.name === "complete" ? (
        <span className="text-muted-foreground text-xs">
          {t("miniApps.inspector.completeHint")}
        </span>
      ) : null}
    </div>
  )
}

export function ActionProp({
  allowed,
  optional,
  screenKey,
}: {
  allowed: readonly MiniAppActionName[]
  optional: boolean
  screenKey: string
}) {
  const { props, setProp } = useInspector()
  return (
    <FieldRow propKey="on-click-action">
      <ActionPicker
        allowed={allowed}
        onChange={(action) => setProp("on-click-action", action)}
        optional={optional}
        screenKey={screenKey}
        value={props["on-click-action"]}
      />
    </FieldRow>
  )
}

type NavigationItem = {
  id: string
  "main-content": { title: string; description?: string; metadata?: string }
  end?: { title?: string }
  badge?: string
  "on-click-action"?: MiniAppAction
}

export function NavigationItemsProp({ screenKey }: { screenKey: string }) {
  const t = useTranslations("miniApps.inspector")
  const tRoot = useTranslations()
  const { props, setProp } = useInspector()
  const items = (
    Array.isArray(props["list-items"]) ? props["list-items"] : []
  ) as NavigationItem[]
  const update = (next: NavigationItem[]) => setProp("list-items", next)
  const patch = (index: number, change: Partial<NavigationItem>) =>
    update(
      items.map((item, position) =>
        position === index ? { ...item, ...change } : item,
      ),
    )

  return (
    <FieldRow propKey="list-items">
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div
            className="flex flex-col gap-1.5 rounded-md border p-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: ids are editable; keying by them would remount the row on every keystroke
            key={index}
          >
            <div className="flex items-center gap-1">
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, {
                    "main-content": {
                      ...item["main-content"],
                      title: event.target.value,
                    },
                  })
                }
                placeholder={t("optionTitle")}
                value={item["main-content"]?.title ?? ""}
              />
              <ItemControls
                count={items.length}
                index={index}
                onMove={(to) => update(moveItem(items, index, to))}
                onRemove={() =>
                  update(items.filter((_, position) => position !== index))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, {
                    "main-content": {
                      ...item["main-content"],
                      description: event.target.value || undefined,
                    },
                  })
                }
                placeholder={tRoot("miniApps.properties.description")}
                value={item["main-content"]?.description ?? ""}
              />
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, {
                    end: { title: event.target.value || undefined },
                  })
                }
                placeholder={t("endText")}
                value={item.end?.title ?? ""}
              />
              <Input
                className="h-8"
                onChange={(event) =>
                  patch(index, { badge: event.target.value || undefined })
                }
                placeholder={t("badge")}
                value={item.badge ?? ""}
              />
              <Input
                className="h-8 font-mono text-xs"
                onChange={(event) => patch(index, { id: event.target.value })}
                placeholder={t("optionId")}
                value={item.id}
              />
            </div>
            <ActionPicker
              allowed={["navigate"]}
              onChange={(action) => patch(index, { "on-click-action": action })}
              optional={false}
              screenKey={screenKey}
              value={item["on-click-action"]}
            />
          </div>
        ))}
        <Button
          onClick={() =>
            update([
              ...items,
              {
                id: nextItemId("item", items),
                "main-content": {
                  title: `${tRoot("miniApps.defaults.navigationItem")} ${items.length + 1}`,
                },
              },
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
          {t("addOption")}
        </Button>
      </div>
    </FieldRow>
  )
}

/** Expression input for If/Switch with one-click field references. */
export function ExpressionProp({
  propKey,
  screenKey,
}: {
  propKey: "condition" | "value"
  screenKey: string
}) {
  const t = useTranslations("miniApps.inspector")
  const { props, setProp } = useInspector()
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const value =
    typeof props[propKey] === "string" ? (props[propKey] as string) : ""
  const references = screens.flatMap((screen) =>
    collectInputNames(screen).map((name) =>
      screen.key === screenKey
        ? `\${form.${name}}`
        : `\${screen.${screen.id}.form.${name}}`,
    ),
  )
  return (
    <FieldRow
      hint={
        propKey === "condition"
          ? t("conditionHint", {
              example: "${form.age} >= 18 && ${form.agree}",
            })
          : t("switchValueHint")
      }
      propKey={propKey}
    >
      <div className="flex flex-col gap-1.5">
        <Textarea
          className="min-h-16 font-mono text-xs"
          onChange={(event) => setProp(propKey, event.target.value)}
          placeholder={
            propKey === "condition" ? "${form.age} >= 18" : "${form.plan}"
          }
          value={value}
        />
        {references.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {references.map((reference) => (
              <button
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/10"
                key={reference}
                onClick={() =>
                  setProp(propKey, value ? `${value} ${reference}` : reference)
                }
                type="button"
              >
                {reference}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldRow>
  )
}

const CASE_KEY_PATTERN = /^[A-Za-z0-9_]+$/

/** Adds, renames and removes the cases of a Switch (each case is a child slot). */
export function SwitchCasesProp({ node }: { node: MiniAppNode }) {
  const t = useTranslations("miniApps.inspector")
  const updateNodeSlots = useMiniAppEditor((state) => state.updateNodeSlots)
  const slots = node.slots ?? {}
  const keys = Object.keys(slots)
  const rename = (from: string, to: string) => {
    if (!(to && CASE_KEY_PATTERN.test(to)) || (to !== from && to in slots)) {
      return
    }
    updateNodeSlots(
      node.id,
      Object.fromEntries(
        keys.map((key) => [key === from ? to : key, slots[key] ?? []]),
      ),
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-sm">{t("cases")}</span>
      {keys.map((key) => (
        <div className="flex items-center gap-1" key={key}>
          <Input
            className="h-8 font-mono text-xs"
            defaultValue={key}
            onBlur={(event) => rename(key, event.target.value.trim())}
          />
          <Button
            aria-label={t("removeItem")}
            disabled={keys.length <= 1}
            onClick={() =>
              updateNodeSlots(
                node.id,
                Object.fromEntries(
                  keys
                    .filter((other) => other !== key)
                    .map((other) => [other, slots[other] ?? []]),
                ),
              )
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        onClick={() => {
          let counter = keys.length + 1
          while (`case_${counter}` in slots) {
            counter++
          }
          updateNodeSlots(node.id, { ...slots, [`case_${counter}`]: [] })
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        {t("addCase")}
      </Button>
      <span className="text-muted-foreground text-xs">{t("casesHint")}</span>
    </div>
  )
}
