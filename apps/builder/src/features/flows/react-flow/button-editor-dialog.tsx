"use client"

import {
  type ButtonStepProps,
  ButtonType,
  buttonStepSchema,
  type FlowNode,
  NodeType,
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  performActionNodeDefaultFn,
  type StartAnotherNodeStepSchema,
  type StartExternalNodeStepSchema,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalNodeStepDefaultFn,
  startFlowNodeDefaultFn,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useReactFlow } from "@xyflow/react"
import { getProperty } from "dot-prop"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { setProperty } from "@/lib/object-util"
import RecursiveDropdownMenu from "./components/recursive-dropdown-menu"
import { sendMessageEditorMenusWithButton } from "./nodes/send-message/menu"
import type { MenuItem } from "./nodes/types"
import { allSteps, DynamicStepEditor } from "./steps"
import { allButtonsConfig } from "./steps/button-config"
import { useStepStore } from "./stores/step-store-provider"

function AllButtonOptions({
  onChooseButton,
}: {
  onChooseButton: (buttonType: ButtonType | null) => void
}) {
  const t = useTranslations()
  const allButtons = allButtonsConfig(t)

  return (
    <div className="flex flex-col gap-1.5">
      {allButtons.map((buttonConfig) => (
        <Button
          className="flex w-full justify-start gap-2"
          key={buttonConfig.buttonType}
          onClick={() => onChooseButton(buttonConfig.buttonType)}
          type="button"
          variant="outline"
        >
          <buttonConfig.icon />
          <span className="text-center">{buttonConfig.label}</span>
        </Button>
      ))}
    </div>
  )
}

function ActiveButton({
  buttonType,
  onChooseButton,
}: {
  buttonType: ButtonType
  onChooseButton: (buttonType: ButtonType | null) => void
}) {
  const t = useTranslations()
  const allButtons = allButtonsConfig(t)
  const activeButton = allButtons.find((bt) => bt.buttonType === buttonType)
  const { getValues } = useFormContext()
  const beforeStep = getValues("beforeStep")

  if (!activeButton) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 rounded border border-dashed pl-4 text-sm">
        <activeButton.icon className="size-4" />
        <span className="flex-1">{activeButton.label}</span>
        <Button
          className="hover:bg-red hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onChooseButton(null)
          }}
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      {beforeStep && (
        <DynamicStepEditor parentName="beforeStep" type={beforeStep.stepType} />
      )}
    </div>
  )
}

function ButtonSteps() {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "steps",
  })

  const onAddAction = (menuItem: MenuItem) => {
    if (menuItem.stepType) {
      const newStep = allSteps[menuItem.stepType]?.defaultFn(menuItem.props)
      if (newStep) {
        append(newStep)
      }
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="font-medium">{t("flows.additionalSteps")}</div>

      {fields.map((field, index) => (
        <div className="flex items-center gap-2" key={field.id}>
          <div className="break-word flex-1">
            <DynamicStepEditor
              parentName={`steps.${index}`}
              // biome-ignore lint/suspicious/noExplicitAny: wip
              type={(field as any).stepType}
            />
          </div>
          <Button
            className="size-8 shrink-0"
            onClick={() => remove(index)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-32" size="sm" variant="outline">
            <PlusIcon />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <RecursiveDropdownMenu
            data={sendMessageEditorMenusWithButton(t)}
            onClick={onAddAction}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ButtonEditorDialog() {
  const [activeNode, setActiveNode] = useState<FlowNode | null>(null)

  const t = useTranslations()

  const {
    getNodes,
    addNodes,
    addEdges,
    updateNodeData,
    deleteElements,
    getEdges,
    screenToFlowPosition,
  } = useReactFlow()
  const {
    buttonPath,
    setButtonPath,
    openButtonEditorDialog,
    setOpenButtonEditorDialog,
    onChangeButtonData,
  } = useStepStore((state) => state)

  const form = useForm<ButtonStepProps>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: {},
    mode: "onChange",
  })
  const { setValue, getValues, control } = form
  const buttonType = useWatch({ control, name: "buttonType" })

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (buttonPath && openButtonEditorDialog) {
      const allNodes = getNodes()
      const foundNode = allNodes.find((node) => node.selected) as FlowNode
      if (foundNode) {
        const rawData = getProperty(foundNode, buttonPath)

        if (rawData) {
          setActiveNode(foundNode)
          form.reset(rawData as ButtonStepProps)
          setOpenButtonEditorDialog(true)
          return
        }
      }
    }

    form.reset()
    setActiveNode(null)
    setOpenButtonEditorDialog(false)
  }, [buttonPath, openButtonEditorDialog])

  const onChooseButton = (selectedButtonType: ButtonType | null) => {
    const allNodes = getNodes() as FlowNode[]

    setValue("buttonType", selectedButtonType)
    setValue("steps", [])
    setValue("beforeStep", null)

    const position = screenToFlowPosition({
      x: window.innerWidth - 400,
      y: 100,
    })

    let newNode: FlowNode | null = null
    let beforeStep:
      | StartAnotherNodeStepSchema
      | OpenWebsiteStepSchema
      | StartExternalNodeStepSchema
      | null = null

    switch (selectedButtonType) {
      case ButtonType.SendMessage: {
        const nodeCount = allNodes.filter(
          (node) => node.type === NodeType.sendMessage,
        ).length
        newNode = sendMessageNodeDefaultFn({
          nodeProps: {
            position,
          },
          dataProps: {
            name: `${t("actions.sendMessage")} #${nodeCount + 1}`,
          },
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        break
      }
      case ButtonType.PerformAction: {
        const nodeCount = allNodes.filter(
          (node) => node.type === NodeType.performAction,
        ).length
        newNode = performActionNodeDefaultFn({
          nodeProps: {
            position,
          },
          dataProps: {
            name: `${t("flows.actions.performAction")} #${nodeCount + 1}`,
          },
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        break
      }
      case ButtonType.StartExternalFlow: {
        const nodeCount = allNodes.filter(
          (node) => node.type === NodeType.startFlow,
        ).length
        newNode = startFlowNodeDefaultFn({
          nodeProps: {
            position,
          },
          dataProps: {
            name: `${t("flows.actions.startExternalFlow")} #${nodeCount + 1}`,
          },
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        break
      }
      case ButtonType.OpenWebsite: {
        beforeStep = openWebsiteStepDefaultFn()
        break
      }
      case ButtonType.StartExternalNode: {
        beforeStep = startExternalNodeStepDefaultFn()
        break
      }
      case ButtonType.StartAnotherNode: {
        beforeStep = startAnotherNodeStepDefaultFn()
        break
      }
      default: {
        return
      }
    }

    if (beforeStep) {
      setValue("beforeStep", beforeStep)
    }

    // Add new node if exists
    if (newNode) {
      addNodes([newNode])

      const currentButtonId = getValues("id") as string
      if (currentButtonId && activeNode) {
        // Delete related edges
        const allEdges = getEdges()
        const relatedEdges = allEdges.filter(
          (edge) => edge.sourceHandle === currentButtonId,
        )
        if (relatedEdges.length > 0) {
          deleteElements({
            edges: relatedEdges.map((edge) => ({ id: edge.id })),
          })
        }

        addEdges({
          id: currentButtonId,
          source: activeNode.id,
          target: newNode.id,
          sourceHandle: currentButtonId,
          targetHandle: newNode.id,
          type: "buttonedge",
        })
      }

      onSave()
    }
  }

  const onDelete = () => {
    if (!(activeNode && buttonPath)) {
      return
    }

    const foundedButton: ButtonStepProps | null = getProperty(
      activeNode,
      buttonPath,
    )
    if (foundedButton) {
      const allEdges = getEdges()
      const relatedEdges = allEdges.filter(
        (edge) => edge.sourceHandle === foundedButton.id,
      )
      if (relatedEdges.length > 0) {
        deleteElements({
          edges: relatedEdges.map((edge) => ({ id: edge.id })),
        })
      }
      onChangeButtonData({
        path: buttonPath,
        data: null,
      })
    }

    setOpenButtonEditorDialog(false)
    setButtonPath(null)
  }

  const onSave = () => {
    if (activeNode && buttonPath) {
      setProperty(activeNode, buttonPath, form.getValues())
      updateNodeData(activeNode.id, activeNode.data)

      setOpenButtonEditorDialog(false)
      onChangeButtonData({
        path: buttonPath,
        data: form.getValues(),
      })
    }
  }

  return getValues("id") ? (
    <Dialog
      onOpenChange={(isOpen) => setOpenButtonEditorDialog(isOpen)}
      open={openButtonEditorDialog}
    >
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.button.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-4">
          <Form {...form}>
            <form
              className="flex w-full flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSave()
              }}
            >
              <InputField
                label={t("fields.name.label")}
                name="label"
                required
              />

              <div className="mt-2 font-medium">
                {t("fields.button.whenPressed")}
              </div>

              {buttonType ? (
                <div className="flex flex-col gap-2">
                  <ActiveButton
                    buttonType={buttonType}
                    onChooseButton={onChooseButton}
                  />
                  <ButtonSteps />
                </div>
              ) : (
                <AllButtonOptions onChooseButton={onChooseButton} />
              )}
            </form>
          </Form>
        </div>

        <DialogFooter>
          <div className="flex-1">
            <Button
              onClick={onDelete}
              size="sm"
              type="button"
              variant="destructive"
            >
              {t("actions.delete")}
            </Button>
          </div>
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button disabled={!form.formState.isValid} onClick={onSave} size="sm">
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null
}
