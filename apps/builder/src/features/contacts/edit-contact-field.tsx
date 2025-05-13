import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ContactResource } from "./schemas/get-contacts-schema"

interface EditContactField {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: ContactResource
  selectedField: string | null
}

export function EditContactField({
  open,
  onOpenChange,
  // contact,
  selectedField,
}: EditContactField) {
  // console.log("ffffff", open, onOpenChange)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle />
        <DialogDescription />
      </DialogHeader>
      <DialogContent>{selectedField}</DialogContent>
    </Dialog>
  )
}
