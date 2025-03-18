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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
// import { actionsBlockEditor } from "@/features/flows/react-flow/nodes/send-message/editor"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { type SendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import { type StartFlowNodeSchema } from "@/features/flows/react-flow/nodes/start-flow/schema"
import { useFlowStore } from "@/features/flows/react-flow/stores/flow-store-provider"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react"
import { DynamicIcon } from "lucide-react/dynamic"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import {
  type ButtonBlockSchema,
  buttonBlockSchema,
  ButtonType,
  allButtonsConfig,
  IButtonConfig,
} from "../schema"
import { XIcon } from "lucide-react"
import { NodeType } from "../../../types"
import { useReactFlow } from "@xyflow/react"
import { createId } from "@paralleldrive/cuid2"

type ButtonNewNodeSchema = SendMessageNodeSchema | StartFlowNodeSchema

export function EditButtonDialog({
  data,
}: {
  data: ButtonBlockSchema
}) {
  const { t } = useTranslate()

  const [open, onOpenChange] = useState(false)
  const { addNode, addEdge, activeNode } = useFlowStore(state => state)
  const { screenToFlowPosition } = useReactFlow()

  // const { getValues } = useFormContext()
  // const buttonData = getValues(parentName)

  // const {
  //   watch: watchOriginEditor,
  //   setValue: setValueOriginEditor,
  //   getValues: getValuesOriginEditor,
  // } = useFormContext()
  // const button: ButtonBlockSchema = watchOriginEditor(parentName)
  // console.log("parentName", parentName)

  const form = useForm<ButtonBlockSchema>({
    resolver: zodResolver(buttonBlockSchema),
    defaultValues: data,
    mode: "onChange",
  })

  const { setValue, watch, control } = form
  const buttonType = watch("buttonType");
  const [activeButton, setActionButton] = useState<IButtonConfig | null>(null)
  useEffect(() => {
    setActionButton(allButtonsConfig.find((btn) => btn.buttonType === buttonType) || null)
    switch (buttonType) {
      case ButtonType.SendMessage: {
        const newNodeId = createId()
        addNode(NodeType.SendMessage, {
          id: newNodeId,
          position: screenToFlowPosition({
            x: window.innerWidth - 400,
            y: 50,
          })
        })
        addEdge({
          source: activeNode?.id ?? "",
          target: newNodeId,
          sourceHandle: data.id,
          targetHandle: newNodeId,
        })
        break
      }
      default:
        setValue("actions", [])
        break
    }
  }, [buttonType, setActionButton])

  const { fields, append, remove } = useFieldArray({
    control,
    name: "actions",
  })

  // const { setNodes, setEdges, getNodes, getEdges } = useReactFlow()
  // const mappingNodeAttributes: Record<
  //   NodeType,
  //   { defaultFn: ReturnType<ButtonNewNodeSchema> }
  // > = {
  //   [NodeType.SendMessage]: {
  //     defaultFn: sendMessageNodeDefaultFn,
  //   },
  //   [NodeType.StartFlow]: {
  //     defaultFn: startFlowNodeDefaultFn,
  //   },
  //   [NodeType.Actions]: {
  //     defaultFn: undefined,
  //   },
  // }

  // const nodeAction = useMemo(() => {
  //   const nodes = getNodes()
  //   const edges = getEdges()
  //   const edge = edges.find((obj) => obj.sourceHandle === button.id)
  //   if (!edge) {
  //     return null
  //   }
  //   const node = nodes.find((obj) => obj.id === edge.targetHandle)
  //   if (!node) {
  //     return null
  //   }

  //   return node as SendMessageNodeSchema
  // }, [getNodes, getEdges, button])

  // const addNode = (name: NodeType) => {
  //   const { nodes } = useFlowStore(state => state)

  //   // calc version
  //   let labelVersion = 1
  //   for (const node of nodes) {
  //     if (node.type === name) {
  //       labelVersion++
  //     }
  //   }

  //   const newNode = mappingNodeAttributes[name].defaultFn?.({
  //     labelVersion,
  //     position: { x: 100, y: 200 },
  //   })
  //   if (!newNode) {
  //     return
  //   }
  //   setNodes((nds) => nds.concat(newNode))
  //   removeOldEdge()
  //   setNewEdge(newNode)
  //   onSave()
  // }

  // const setNewEdge = (node: ButtonNewNodeSchema) => {
  //   setEdges((edges) => {
  //     if (activeNode.id === node.id) {
  //       return edges
  //     }
  //     const newEdge: Edge = {
  //       id: `xy-edge__${activeNode.id}${button.id}-${node.id}${node.id}`,
  //       source: activeNode.id,
  //       sourceHandle: button.id,
  //       target: node.id,
  //       targetHandle: node.id,
  //     }

  //     return addEdge(newEdge, edges)
  //   })
  // }

  // const removeOldEdge = () => {
  //   setEdges((edges) => edges.filter((edge) => edge.sourceHandle !== button.id))
  // }

  // const onChangeType = (actionType: ButtonActionType | null) => {
  //   setValue("type", actionType)

  //   switch (actionType) {
  //     case ButtonActionType.SendMessage:
  //       addNode(NodeType.SendMessage)
  //       break
  //     case ButtonActionType.OpenWebsite:
  //       setValue("url", "")
  //       break
  //     case ButtonActionType.CallPhoneNumber:
  //       setValue("phoneNumber", "")
  //       break
  //     case ButtonActionType.PerformAction:
  //       addNode(NodeType.Actions)
  //       break
  //     case ButtonActionType.StartAnotherFlow:
  //       addNode(NodeType.StartFlow)
  //       break
  //     case ButtonActionType.StartAnotherStep:
  //       break
  //     case ButtonActionType.StartExternalStep:
  //       setValue("stepId", "")
  //       break
  //     default:
  //       break
  //   }
  // }

  // const onClickAction = (name: ActionType) => {
  //   const value = generateDefaultFn(name)
  //   if (value) {
  //     append(value)
  //   }
  // }

  // const onDelete = () => {
  //   removeOldEdge()
  //   const arr = parentName.split(".")
  //   const btnIndex = Number.parseInt(arr.pop() as string)
  //   const currentBtns = getValuesOriginEditor(arr.join("."))
  //   currentBtns.splice(btnIndex, 1)
  //   setValueOriginEditor(arr.join("."), currentBtns)
  //   onOpenChange(false)
  // }
  // const onSave = () => {
  //   // Check if change type next flow, reset edge
  //   const type = getValues("type")
  //   if (!type || !ButtonActionFlow.includes(type)) {
  //     removeOldEdge()
  //   }
  //   if (type === ButtonActionType.StartAnotherStep) {
  //     const newNode = getNodes().find((node) => node.id === getValues("nodeId"))
  //     if (newNode) {
  //       removeOldEdge()
  //       setNewEdge(newNode)
  //     }
  //   }
  //   setValueOriginEditor(parentName, getValues())
  //   onOpenChange(false)
  // }

  const buttonTypeOptions = useMemo(() => {
    return activeButton ? (
      <div className="flex flex-col gap-2">
        <div className="flex gap-1 pl-4 items-center text-sm border border-dashed rounded">
          <DynamicIcon className="size-4" name={activeButton.icon} />
          <span className="text-center flex-1">
            {activeButton.label}
          </span>
          <Button
            variant="ghost" className="hover:bg-red hover:text-destructive" onClick={() => setValue("buttonType", null)}>
            <XIcon />
          </Button>
        </div>


        {(fields as ButtonBlockSchema["actions"]).map(
          (field, index) => (
            <div
              key={field.id}
              className={"flex gap-2 items-center"}
            >
              {field.actionType}
              {/* {formState.errors.actions?.[index] ? (
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
                  </div> */}
              {/* <div className="flex flex-col">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => remove(index)}
                    >
                      <XIcon
                        className="size-4"
                        aria-hidden="true"
                      />
                    </Button>
                  </div> */}
            </div>
          ),
        )}
      </div>
    ) : (
      <div className="flex flex-col gap-1.5">
        {allButtonsConfig.map((buttonConfig) => (
          <Button
            key={buttonConfig.buttonType}
            // size="sm"
            type="button"
            variant="outline"
            className="flex gap-2 w-full justify-start"
            onClick={() => setValue("buttonType", buttonConfig.buttonType)}
          >
            <DynamicIcon name={buttonConfig.icon} />
            <span className="text-center">
              {buttonConfig.label}
            </span>
          </Button>
        ))}
      </div>
    )
  }, [allButtonsConfig, activeButton])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          {data.label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex flex-col gap-3 w-full">
              <FormInput name="label" label={t("flows.Button.label")} />

              <Label>When This Button is Pressed</Label>

              {buttonTypeOptions}

              {/* <div className="flex-1 space-y-4">
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
                                  <XIcon
                                    className="size-4"
                                    aria-hidden="true"
                                  />
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
              </div> */}
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="destructive"
          // onClick={onDelete}
          >
            {t("common.delete")}
          </Button>
          <Button
            size="sm"
          // onClick={onSave}
          // disabled={!formState.isValid}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
