import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { Button, type ButtonProps } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useNodeId, useReactFlow } from "@xyflow/react"
import { EllipsisVertical, Trash } from "lucide-react"
import { useTranslations } from "next-intl"
import { type HTMLAttributes, type ReactNode, useCallback } from "react"

/* NODE HEADER -------------------------------------------------------------- */

export type NodeHeaderProps = HTMLAttributes<HTMLElement>

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export const NodeHeader = ({
  ref,
  className,
  ...props
}: NodeHeaderProps & {
  ref: React.RefObject<HTMLElement>
}) => {
  return (
    <header
      ref={ref}
      {...props}
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2",
        // Remove or modify these classes if you modify the padding in the
        // `<BaseNode />` component.
        className,
      )}
    />
  )
}

NodeHeader.displayName = "NodeHeader"

/* NODE HEADER TITLE -------------------------------------------------------- */

export type NodeHeaderTitleProps = useRender.ComponentProps<"h3">

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export const NodeHeaderTitle = ({
  className,
  render,
  ...props
}: NodeHeaderTitleProps) =>
  useRender({
    defaultTagName: "h3",
    render,
    props: mergeProps<"h3">(
      {
        className: cn(className, "user-select-none flex-1 font-semibold"),
      } as React.ComponentProps<"h3">,
      props,
    ),
  })

NodeHeaderTitle.displayName = "NodeHeaderTitle"

/* NODE HEADER ICON --------------------------------------------------------- */

export type NodeHeaderIconProps = HTMLAttributes<HTMLSpanElement>

export const NodeHeaderIcon = ({
  ref,
  className,
  ...props
}: NodeHeaderIconProps & {
  ref: React.RefObject<HTMLSpanElement>
}) => <span ref={ref} {...props} className={cn(className, "*:size-5")} />

NodeHeaderIcon.displayName = "NodeHeaderIcon"

/* NODE HEADER ACTIONS ------------------------------------------------------ */

export type NodeHeaderActionsProps = HTMLAttributes<HTMLDivElement>

/**
 * A container for right-aligned action buttons in the node header.
 */
export const NodeHeaderActions = ({
  ref,
  className,
  ...props
}: NodeHeaderActionsProps & {
  ref: React.RefObject<HTMLDivElement>
}) => (
  <div
    ref={ref}
    {...props}
    className={cn(
      "ms-auto flex items-center gap-1 justify-self-end",
      className,
    )}
  />
)

NodeHeaderActions.displayName = "NodeHeaderActions"

/* NODE HEADER ACTION ------------------------------------------------------- */

export type NodeHeaderActionProps = ButtonProps & {
  label: string
}

/**
 * A thin wrapper around the `<Button />` component with a fixed sized suitable
 * for icons.
 *
 * Because the `<NodeHeaderAction />` component is intended to render icons, it's
 * important to provide a meaningful and accessible `label` prop that describes
 * the action.
 */
export const NodeHeaderAction = ({
  ref,
  className,
  label,
  title,
  ...props
}: NodeHeaderActionProps & {
  ref?: React.RefObject<HTMLButtonElement>
}) => (
  <Button
    aria-label={label}
    className={cn(className, "nodrag size-6 p-1")}
    ref={ref}
    title={title ?? label}
    variant="ghost"
    {...props}
  />
)

NodeHeaderAction.displayName = "NodeHeaderAction"

//

export type NodeHeaderMenuActionProps = Omit<
  NodeHeaderActionProps,
  "onClick"
> & {
  trigger?: ReactNode
}

/**
 * Renders a header action that opens a dropdown menu when clicked. The dropdown
 * trigger is a button with an ellipsis icon. The trigger's content can be changed
 * by using the `trigger` prop.
 *
 * Any children passed to the `<NodeHeaderMenuAction />` component will be rendered
 * inside the dropdown menu. You can read the docs for the shadcn dropdown menu
 * here: https://ui.shadcn.com/docs/components/dropdown-menu
 *
 */
export const NodeHeaderMenuAction = ({
  ref,
  trigger,
  children,
  ...props
}: NodeHeaderMenuActionProps & {
  ref: React.RefObject<HTMLButtonElement>
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <NodeHeaderAction ref={ref} {...props}>
          {trigger ?? <EllipsisVertical />}
        </NodeHeaderAction>
      }
    />
    <DropdownMenuContent>{children}</DropdownMenuContent>
  </DropdownMenu>
)

NodeHeaderMenuAction.displayName = "NodeHeaderMenuAction"

/* NODE HEADER DELETE ACTION --------------------------------------- */

export const NodeHeaderDeleteAction = () => {
  const t = useTranslations()
  const id = useNodeId()
  const { setNodes } = useReactFlow()

  const handleClick = useCallback(() => {
    setNodes((prevNodes) => prevNodes.filter((node) => node.id !== id))
  }, [id, setNodes])

  return (
    <NodeHeaderAction
      label={t("actions.delete")}
      onClick={handleClick}
      variant="ghost"
    >
      <Trash />
    </NodeHeaderAction>
  )
}

NodeHeaderDeleteAction.displayName = "NodeHeaderDeleteAction"
