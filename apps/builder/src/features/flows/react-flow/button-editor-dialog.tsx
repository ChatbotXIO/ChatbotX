"use client"
import type {
  FlowNode,
  OpenWebsiteStepSchema,
  StartAnotherNodeStepSchema,
  StartExternalNodeStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import {
  type ButtonStepProps,
  ButtonType,
  buttonStepSchema,
  openWebsiteStepDefaultFn,
  performActionNodeDefaultFn,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalNodeStepDefaultFn,
  startFlowNodeDefaultFn,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
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
import { useNodes, useReactFlow } from "@xyflow/react"
import { getProperty, setProperty } from "dot-prop"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { deleteProperty } from "@/lib/object-util"
import RecursiveDropdownMenu from "./components/recursive-dropdown-menu"
import { sendMessageEditorMenusWithButton } from "./nodes/send-message/menu"
import { DynamicStepEditor } from "./steps"
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

  const onAddAction = (action: StepType) => {
    append({
      stepType: action,
    })
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="font-medium">{t("flows.additionalSteps")}</div>

      {fields.map((field, index) => (
        <div className="flex items-center gap-2" key={field.id}>
          <div className="flex-1 break-all">
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
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [data, setData] = useState<ButtonStepProps | null>(null)
  const [originData, setOriginData] = useState<ButtonStepProps | null>(null)
  const [activeNode, setActiveNode] = useState<FlowNode | null>(null)
  const [needReconnectEdges, setNeedReconnectEdges] = useState<boolean>(false)

  const nodes = useNodes() as FlowNode[]
  const t = useTranslations()

  const {
    addNodes,
    screenToFlowPosition,
    addEdges,
    updateNodeData,
    deleteElements,
  } = useReactFlow()
  const { buttonPath, setButtonPath, setOpenNodeDetailSheet } = useStepStore(
    (state) => state,
  )

  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setButtonPath(null)
    }
  }

  const calcPosition = () =>
    screenToFlowPosition({
      x: window.innerWidth - 400,
      y: 100,
    })

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (buttonPath) {
      const foundNode = nodes.find((node) => node.selected) as FlowNode
      if (foundNode) {
        const rawData = getProperty(foundNode, buttonPath)

        if (rawData) {
          setActiveNode(foundNode)
          setData(rawData as ButtonStepProps)
          setOriginData(rawData as ButtonStepProps)
          setOpenDialog(true)
          return
        }
      }
    }

    setData(null)
    setActiveNode(null)
    setOpenDialog(false)
  }, [buttonPath])

  const form = useForm<ButtonStepProps>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: data || {},
    mode: "onChange",
  })
  const { formState, setValue, watch } = form
  const [buttonType] = watch(["buttonType"])

  useEffect(() => {
    if (data) {
      form.reset(data)
    }
  }, [data, form])

  // const activeButtonType = watch("buttonType")
  const onChooseButton = (selectedButtonType: ButtonType | null) => {
    setValue("buttonType", selectedButtonType)
    setValue("steps", [])
    setValue("beforeStep", null)

    let newNode: FlowNode | null = null
    let beforeStep:
      | StartAnotherNodeStepSchema
      | OpenWebsiteStepSchema
      | StartExternalNodeStepSchema
      | null = null
    switch (selectedButtonType) {
      case ButtonType.SendMessage: {
        newNode = sendMessageNodeDefaultFn({
          name: `${t("actions.sendMessage")} #${nodes.length + 1}`,
          position: calcPosition(),
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        setNeedReconnectEdges(true)
        break
      }
      case ButtonType.PerformAction: {
        newNode = performActionNodeDefaultFn({
          name: `${t("flows.actions.performAction")} #${nodes.length + 1}`,
          position: calcPosition(),
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        setNeedReconnectEdges(true)
        break
      }
      case ButtonType.StartExternalFlow: {
        newNode = startFlowNodeDefaultFn({
          name: `${t("flows.actions.startExternalFlow")} #${nodes.length + 1}`,
          position: calcPosition(),
        })
        beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: newNode.id,
          viewOnly: true,
        })
        setNeedReconnectEdges(true)
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

      if (data && activeNode) {
        addEdges({
          id: data.id,
          source: activeNode.id,
          target: newNode.id,
          sourceHandle: data.id,
          targetHandle: newNode.id,
        })
      }

      onSave()
    }
  }

  const onDelete = () => {
    if (!(activeNode && buttonPath)) {
      return
    }

    const foundedStep = getProperty<FlowNode, string, ButtonStepProps>(
      activeNode,
      buttonPath,
    )
    const deleted = deleteProperty(activeNode, buttonPath)
    if (deleted && foundedStep) {
      // updateNodeData(activeNode.id, updatedCurrentNodeData.data)
      // onSave()
      updateNodeData(activeNode.id, activeNode.data)
      deleteElements({
        edges: [
          {
            id: foundedStep.id,
          },
        ],
      })
      // onSave()
    }

    setOpenDialog(false)
    setButtonPath(null)
  }

  const onSave = () => {
    // Re-connect edges if needed
    if (needReconnectEdges && originData) {
      deleteElements({
        edges: [
          {
            id: originData.id,
          },
        ],
      })
    }

    if (activeNode && buttonPath) {
      setProperty(activeNode, buttonPath, form.getValues())

      updateNodeData(activeNode.id, activeNode.data)

      setOpenDialog(false)

      setOpenNodeDetailSheet(false)
    }
  }

  return data ? (
    <Dialog onOpenChange={onOpenChange} open={openDialog}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("dialog.updateTitle", { feature: t("fields.button.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-4">
          <Form {...form}>
            <form className="flex w-full flex-col gap-3">
              <InputField label={t("fields.name.label")} name="label" />

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
          <Button
            className="text-destructive"
            onClick={onDelete}
            size="sm"
            variant="ghost"
          >
            {t("actions.delete")}
          </Button>
          <Button disabled={!formState.isValid} onClick={onSave} size="sm">
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null
}
