"use client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { T, useTranslate } from "@tolgee/react"
import { useNodes, useReactFlow } from "@xyflow/react"
import { getProperty, setProperty, deleteProperty } from "dot-prop"
import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import {
  buttonStepSchema,
  type ButtonStepSchema,
  ButtonType,
  sendFlowNodeStepDefaultFn,
  sendMessageNodeDefaultFn,
} from "@ahachat.ai/flow-config"
import { useStepStore } from "./stores/step-store-provider"
import type { FlowNode } from "@ahachat.ai/flow-config"
import { InputField } from "@/components/form/input-field"
import { allButtonsConfig } from "./steps/button-config"
import { openWebsiteStepDefaultFn } from "node_modules/@ahachat.ai/flow-config/src/schemas/steps/open-website"
import { DynamicStepEditor } from "./steps"

function AllButtonOptions({
  onChooseButton,
}: {
  onChooseButton: (buttonType: ButtonType | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {allButtonsConfig.map((buttonConfig) => (
        <Button
          key={buttonConfig.buttonType}
          type="button"
          variant="outline"
          className="flex gap-2 w-full justify-start"
          onClick={() => onChooseButton(buttonConfig.buttonType)}
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
  if (!activeButton) return null

  return (
    <div className="flex gap-1 pl-4 items-center text-sm border border-dashed rounded">
      <activeButton.icon className="size-4" />
      <span className="text-center flex-1">{activeButton.label}</span>
      <Button
        variant="ghost"
        className="hover:bg-red hover:text-destructive"
        onClick={() => onChooseButton(null)}
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
    <div className="flex flex-col gap-2 mt-2">
      <div className="text-sm font-medium">Additional steps</div>
      {fields.map((field, index) => (
        <DynamicStepEditor
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
          type={(field as any).stepType}
          key={field.id}
          parentName={`steps.${index}`}
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

  const onOpenChange = (open: boolean) => {
    if (!open) {
      setButtonPath(null)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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
  const onChooseButton = (buttonType: ButtonType | null) => {
    setValue("buttonType", buttonType)

    switch (buttonType) {
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
    if (!activeNode || !buttonPath) return

    const deleted = deleteProperty(activeNode, buttonPath)
    if (deleted) {
      console.log("activeNode", activeNode)
      console.log("buttonPath", buttonPath)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>
            <T keyName="flows.Button.edit" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex flex-col gap-3 w-full">
              <InputField name="label" label={t("flows.Button.label")} />

              <div className="mt-2 text-sm font-medium">
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
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <T keyName="common.delete" />
          </Button>
          <Button size="sm" onClick={onSave} disabled={!formState.isValid}>
            <T keyName="common.save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null
}
