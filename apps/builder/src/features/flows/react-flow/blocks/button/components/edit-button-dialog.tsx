"use client"

import { FormInput } from "@/components/form-input"
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
import { ButtonActionSelect } from "@/features/flows/react-flow/blocks/button/components/action-select"
import { BrowserSizeSelect } from "@/features/flows/react-flow/blocks/button/components/browser-size-select"
import { ErrorAlert } from "@/features/flows/react-flow/blocks/error-alert"
import { generateDefaultValue } from "@/features/flows/react-flow/blocks/utils"
import { NodeSelect } from "@/features/flows/react-flow/nodes/node-select"
import { actionsBlockEditor } from "@/features/flows/react-flow/nodes/send-message/editor"
import {
  type SendMessageNodeSchema,
  defaultSendMessageNode,
} from "@/features/flows/react-flow/nodes/send-message/schema"
import {
  type StartFlowNodeSchema,
  startFlowNodeDefaultValue,
} from "@/features/flows/react-flow/nodes/start-flow/schema"
import { NodeType } from "@/features/flows/react-flow/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react"
import { type Edge, type Node, addEdge, useReactFlow } from "@xyflow/react"
import { MessageCircleIcon, PencilIcon, XIcon } from "lucide-react"
import { useMemo } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { ActionType } from "../../../action-type"
import {
  ButtonActionFlow,
  ButtonActionType,
  type ButtonBlockSchema,
  buttonBlockSchema,
} from "../schema"
import ButtonEditorAction from "./editor-action"

type ButtonNewNodeSchema = SendMessageNodeSchema | StartFlowNodeSchema

export function EditButtonDialog({
  activeNode,
  parentName,
  open,
  onOpenChange,
}: {
  activeNode: Node
  parentName: string
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const { t } = useTranslate()

  const {
    watch: watchOriginEditor,
    setValue: setValueOriginEditor,
    getValues: getValuesOriginEditor,
  } = useFormContext()
  const button: ButtonBlockSchema = watchOriginEditor(parentName)
  console.log("parentName", parentName)

  const form = useForm<ButtonBlockSchema>({
    resolver: zodResolver(buttonBlockSchema),
    defaultValues: button,
    mode: "onChange",
  })

  const { control, watch, setValue, formState, getValues } = form
  const type = watch("type")
  const { fields, append, remove } = useFieldArray({
    control,
    name: "actions",
  })

  const { setNodes, setEdges, getNodes, getEdges } = useReactFlow()
  const mappingNodeAttributes: Record<
    NodeType,
    { defaultFn: ReturnType<ButtonNewNodeSchema> }
  > = {
    [NodeType.SendMessage]: {
      defaultFn: defaultSendMessageNode,
    },
    [NodeType.StartFlow]: {
      defaultFn: startFlowNodeDefaultValue,
    },
    [NodeType.Actions]: {
      defaultFn: undefined,
    },
  }

  const nodeAction = useMemo(() => {
    const nodes = getNodes()
    const edges = getEdges()
    const edge = edges.find((obj) => obj.sourceHandle === button.id)
    if (!edge) {
      return null
    }
    const node = nodes.find((obj) => obj.id === edge.targetHandle)
    if (!node) {
      return null
    }

    return node as SendMessageNodeSchema
  }, [getNodes, getEdges, button])

  const addNode = (name: NodeType) => {
    const nodes = getNodes()
    // calc version
    let labelVersion = 1
    for (const node of nodes) {
      if (node.type === name) {
        labelVersion++
      }
    }

    const newNode = mappingNodeAttributes[name].defaultFn?.({
      labelVersion,
      position: { x: 100, y: 200 },
    })
    if (!newNode) {
      return
    }
    setNodes((nds) => nds.concat(newNode))
    removeOldEdge()
    setNewEdge(newNode)
    onSave()
  }

  const setNewEdge = (node: ButtonNewNodeSchema) => {
    setEdges((edges) => {
      if (activeNode.id === node.id) {
        return edges
      }
      const newEdge: Edge = {
        id: `xy-edge__${activeNode.id}${button.id}-${node.id}${node.id}`,
        source: activeNode.id,
        sourceHandle: button.id,
        target: node.id,
        targetHandle: node.id,
      }

      return addEdge(newEdge, edges)
    })
  }

  const removeOldEdge = () => {
    setEdges((edges) => edges.filter((edge) => edge.sourceHandle !== button.id))
  }

  const onChangeType = (actionType: ButtonActionType | null) => {
    setValue("type", actionType)

    switch (actionType) {
      case ButtonActionType.SendMessage:
        addNode(NodeType.SendMessage)
        break
      case ButtonActionType.OpenWebsite:
        setValue("url", "")
        break
      case ButtonActionType.CallPhoneNumber:
        setValue("phoneNumber", "")
        break
      case ButtonActionType.PerformAction:
        addNode(NodeType.Actions)
        break
      case ButtonActionType.StartAnotherFlow:
        addNode(NodeType.StartFlow)
        break
      case ButtonActionType.StartAnotherStep:
        break
      case ButtonActionType.StartExternalStep:
        setValue("stepId", "")
        break
      default:
        break
    }
  }

  const onClickAction = (name: ActionType) => {
    const value = generateDefaultValue(name)
    if (value) {
      append(value)
    }
  }

  const onDelete = () => {
    removeOldEdge()
    const arr = parentName.split(".")
    const btnIndex = Number.parseInt(arr.pop() as string)
    const currentBtns = getValuesOriginEditor(arr.join("."))
    currentBtns.splice(btnIndex, 1)
    setValueOriginEditor(arr.join("."), currentBtns)
    onOpenChange(false)
  }
  const onSave = () => {
    // Check if change type next flow, reset edge
    const type = getValues("type")
    if (!type || !ButtonActionFlow.includes(type)) {
      removeOldEdge()
    }
    if (type === ButtonActionType.StartAnotherStep) {
      const newNode = getNodes().find((node) => node.id === getValues("nodeId"))
      if (newNode) {
        removeOldEdge()
        setNewEdge(newNode)
      }
    }
    setValueOriginEditor(parentName, getValues())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <div className="flex-1 space-y-4">
              <FormInput name="label" label={t("flows.Button.label")} />
              <ButtonActionSelect
                name="actions.0.actionType"
                label={t("flows.Button.whenPressed")}
                onSelect={onChangeType}
              />
              {type && ButtonActionFlow.includes(type) && nodeAction && (
                <div className="w-full flex border hover:border-blue-500 cursor-pointer p-3 mt-4">
                  <MessageCircleIcon />
                  <div className="flex-1 text-center">
                    {nodeAction.data.name}
                  </div>
                  <PencilIcon />
                </div>
              )}
              {type === ButtonActionType.OpenWebsite && (
                <>
                  <FormInput name="url" label={t("common.link")} />
                  <BrowserSizeSelect
                    name="browserSize"
                    label={t("flows.Button.browserSize")}
                  />
                </>
              )}
              {type === ButtonActionType.CallPhoneNumber && (
                <FormInput
                  name="phoneNumber"
                  label={t("flows.Button.phoneNumber")}
                />
              )}
              {type === ButtonActionType.StartAnotherStep && (
                <NodeSelect name="nodeId" label={t("flows.node.selectStep")} />
              )}
              {type === ButtonActionType.StartExternalStep && (
                <FormInput name="stepId" label={t("flows.Button.stepId")} />
              )}
              {!!type && (
                <FormInput
                  name="actions"
                  label={t("flows.Button.additionalActions")}
                >
                  <div className="flex flex-col flex-1 gap-2 my-2">
                    <div className="flex w-full flex-col gap-4">
                      {(fields as ButtonBlockSchema["actions"]).map(
                        (field, index) => (
                          <div
                            key={field.id}
                            className={"flex gap-2 items-center"}
                          >
                            {formState.errors.actions?.[index] ? (
                              <ErrorAlert
                                message={
                                  typeof formState.errors.actions?.[index]
                                    ?.message === "object"
                                    ? ((
                                        formState.errors.actions?.[index]
                                          ?.message as { message: string }
                                      ).message as string)
                                    : ""
                                }
                              />
                            ) : (
                              <div className="w-4">{"\u00A0"}</div>
                            )}
                            <div className={"flex-1 break-all"}>
                              {field.actionType in ActionType
                                ? actionsBlockEditor[
                                    field.actionType as ActionType
                                  ]?.({
                                    key: field.id,
                                    parentName: `blocks.${index}`,
                                  })
                                : null}
                            </div>
                            <div className="flex flex-col">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                onClick={() => remove(index)}
                              >
                                <XIcon className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <ButtonEditorAction onClick={onClickAction} />
                </FormInput>
              )}
            </div>
          </Form>
        </div>
        <DialogFooter>
          <Button
            aria-label="Delete button"
            variant="destructive"
            onClick={onDelete}
          >
            {t("common.delete")}
          </Button>
          <Button
            aria-label="Save button"
            onClick={onSave}
            disabled={!formState.isValid}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
