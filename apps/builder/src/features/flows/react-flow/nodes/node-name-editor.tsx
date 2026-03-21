import type { FlowNode } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useReactFlow } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"
import z from "zod"

const nameValitator = z.object({
  name: z.string().min(1).max(100),
})

export function NodeNameEditor({ activeNode }: { activeNode: FlowNode }) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const { updateNodeData } = useReactFlow()

  const form = useForm({
    resolver: zodResolver(nameValitator),
    defaultValues: {
      name: activeNode.data.name,
    },
    mode: "onBlur",
  })

  const onSubmit = (data: z.infer<typeof nameValitator>) => {
    updateNodeData(activeNode.id, { name: data.name })
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className="max-w-[80%] truncate px-5 py-3 text-lg">
        {activeNode.data.name}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.name.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex w-full flex-col gap-6"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <InputField label="Name" name="name" required />

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button size="sm" type="submit">
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
