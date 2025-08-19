"use client"
import type { FlowNode } from "@aha.chat/flow-config"
import {
  type ButtonStepSchema,
  ButtonType,
  buttonStepSchema,
  sendFlowNodeStepDefaultFn,
  sendMessageNodeDefaultFn,
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
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { T, useTranslate } from "@tolgee/react"
import { useNodes, useReactFlow } from "@xyflow/react"
import { deleteProperty, getProperty, setProperty } from "dot-prop"
import { XIcon } from "lucide-react"
import { openWebsiteStepDefaultFn } from "node_modules/@aha.chat/flow-config/src/schemas/steps/open-website"
import { useEffect, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { DynamicStepEditor } from "./steps"
import { allButtonsConfig } from "./steps/button-config"
import { useStepStore } from "./stores/step-store-provider"

function AllButtonOptions({
  onChooseButton,
}: {
  onChooseButton: (buttonType: ButtonType | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {allButtonsConfig.map((buttonConfig) => (
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
  const activeButton = allButtonsConfig.find(
    (button) => button.buttonType === buttonType,
  )
  if (!activeButton) {
    return null
  }

  return (
    <div className="flex items-center gap-1 rounded border border-dashed pl-4 text-sm">
      <activeButton.icon className="size-4" />
      <span className="flex-1 text-center">{activeButton.label}</span>
      <Button
        className="hover:bg-red hover:text-destructive"
        onClick={() => onChooseButton(null)}
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  )
}

function ButtonSteps() {
  const { control } = useFormContext()
  const { fields } = useFieldArray({
    control,
    name: "steps",
  })

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="font-medium text-sm">Additional steps</div>
      {fields.map((field, index) => (
        <DynamicStepEditor
          key={field.id}
          parentName={`steps.${index}`}
          // biome-ignore lint/suspicious/noExplicitAny: wip
          type={(field as any).stepType}
        />
      ))}
    </div>
  )
}

export function ButtonEditorDialog() {
  const [open, setOpen] = useState<boolean>(false)
  const [data, setData] = useState<ButtonStepSchema | null>(null)
  const [activeNode, setActiveNode] = useState<FlowNode | null>(null)

  const nodes = useNodes() as FlowNode[]
  const { t } = useTranslate()

  const { addNodes, screenToFlowPosition, addEdges, updateNodeData } =
    useReactFlow()
  const { buttonPath, setButtonPath, setOpenNodeDetailSheet } = useStepStore(
    (state) => state,
  )

  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setButtonPath(null)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    if (buttonPath) {
      const foundNode = nodes.find((node) => node.selected) as FlowNode
      if (foundNode) {
        const rawData = getProperty(foundNode, buttonPath)

        if (rawData) {
          setActiveNode(foundNode)
          setData(rawData as ButtonStepSchema)
          setOpen(true)
          return
        }
      }
    }

    setData(null)
    setActiveNode(null)
    setOpen(false)
  }, [buttonPath])

  const form = useForm<ButtonStepSchema>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: data || {},
    mode: "onChange",
  })
  const { formState, setValue, getValues, watch } = form
  const [buttonType] = watch(["buttonType"])

  useEffect(() => {
    if (data) {
      form.reset(data)
    }
  }, [data, form])

  // const activeButtonType = watch("buttonType")
  const onChooseButton = (selectedButtonType: ButtonType | null) => {
    setValue("buttonType", selectedButtonType)

    switch (selectedButtonType) {
      case ButtonType.SendMessage: {
        // create new node
        const newNode = sendMessageNodeDefaultFn({
          labelVersion: nodes.length + 1,
          position: screenToFlowPosition({
            x: window.innerWidth - 400,
            y: 50,
          }),
        })
        addNodes([newNode])
        addEdges({
          id: `xy-edge__${activeNode?.id}${data?.id}-${newNode.id}${newNode.id}`,
          source: activeNode?.id ?? "",
          target: newNode.id,
          sourceHandle: data?.id,
          targetHandle: newNode.id,
        })

        // update current node
        if (activeNode && buttonPath) {
          setValue("steps", [sendFlowNodeStepDefaultFn(newNode.id)])
          const newData = {
            ...data,
            ...getValues(),
          }

          const updatedCurrentNodeData = setProperty(
            activeNode,
            buttonPath,
            newData,
          )

          updateNodeData(activeNode.id, updatedCurrentNodeData.data)

          onSave()
        }

        break
      }
      case ButtonType.OPEN_WEBSITE: {
        setValue("steps", [openWebsiteStepDefaultFn()])
        break
      }
      default:
        setValue("steps", [])
        break
    }
    setValue("buttonType", buttonType)
  }

  const onDelete = () => {
    if (!(activeNode && buttonPath)) {
      return
    }

    const deleted = deleteProperty(activeNode, buttonPath)
    if (deleted) {
      // updateNodeData(activeNode.id, updatedCurrentNodeData.data)
      // onSave()
    }
    updateNodeData(activeNode.id, activeNode.data)
    onSave()
    // removeOldEdge()
    // const arr = parentName.split(".")
    // const btnIndex = Number.parseInt(arr.pop() as string)
    // const currentBtns = getValuesOriginEditor(arr.join("."))
    // currentBtns.splice(btnIndex, 1)
    // setValueOriginEditor(arr.join("."), currentBtns)
    // onOpenChange(false)
  }

  const onSave = () => {
    setOpenNodeDetailSheet(false)
    setOpen(false)

    // Check if change type next flow, reset edge
    // const type = getValues("type")
    // if (!type || !ButtonActionFlow.includes(type)) {
    //   removeOldEdge()
    // }
    // if (type === ButtonActionType.StartAnotherStep) {
    //   const newNode = nodes.find((node) => node.id === getValues("nodeId"))
    //   if (newNode) {
    //     removeOldEdge()
    //     setNewEdge(newNode)
    //   }
    // }
    // setValueOriginEditor(parentName, getValues())
    // onOpenChange(false)
    // setOpenNodeDetailSheet(false)
  }

  return data ? (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>
            <T keyName="flows.Button.edit" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex w-full flex-col gap-3">
              <InputField label={t("flows.Button.label")} name="label" />

              <div className="mt-2 font-medium text-sm">
                When this button is pressed
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
          <Button onClick={onDelete} size="sm" variant="destructive">
            <T keyName="common.delete" />
          </Button>
          <Button disabled={!formState.isValid} onClick={onSave} size="sm">
            <T keyName="common.save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null
}
