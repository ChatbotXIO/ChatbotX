"use client";

// Locally patched for RTL; reapply after refreshing from the upstream shadcn registry.

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@chatbotx.io/ui/lib/utils";

interface DialogContextValue {
  innerOpen: boolean;
  setInnerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DialogContext = React.createContext<DialogContextValue | undefined>(
  undefined,
);

function Dialog({ children }: { children: React.ReactNode }) {
  const [outerOpen, setOuterOpen] = React.useState(false);
  const [innerOpen, setInnerOpen] = React.useState(false);

  return (
    <DialogContext.Provider value={{ innerOpen, setInnerOpen }}>
      <DialogPrimitive.Root open={outerOpen} onOpenChange={setOuterOpen}>
        {children}
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/40 backdrop-blur-sm transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("DialogContent must be used within a Dialog");

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={ref}
        className={cn(
          "fixed start-[50%] top-[50%] z-50 grid w-full max-w-lg ltr:translate-x-[-50%] rtl:translate-x-[50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 transition-[transform,opacity] data-starting-style:opacity-0 data-ending-style:opacity-0 data-starting-style:scale-95 data-ending-style:scale-95 sm:rounded-lg",
          context.innerOpen && "translate-y-[-55%] scale-[0.97]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogClose className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-popup-open:bg-accent data-popup-open:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
});
DialogContent.displayName = "DialogContent";

function InnerDialog({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("InnerDialog must be used within a Dialog");

  React.useEffect(() => {
    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && context.innerOpen) {
        context.setInnerOpen(false);
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleEscapeKeyDown);
    return () => {
      document.removeEventListener("keydown", handleEscapeKeyDown);
    };
  }, [context.innerOpen, context.setInnerOpen]);

  return (
    <DialogPrimitive.Root
      open={context.innerOpen}
      onOpenChange={context.setInnerOpen}
    >
      {children}
    </DialogPrimitive.Root>
  );
}

const InnerDialogTrigger = DialogPrimitive.Trigger;
const InnerDialogClose = DialogPrimitive.Close;

interface InnerDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  position?: "default" | "bottom" | "top" | "left" | "right";
  draggable?: boolean;
}

const InnerDialogContent = React.forwardRef<
  HTMLDivElement,
  InnerDialogContentProps
>(
  (
    { className, children, position = "default", draggable = false, ...props },
    ref,
  ) => {
    const context = React.useContext(DialogContext);
    if (!context)
      throw new Error("InnerDialogContent must be used within a Dialog");

    const [isDragging, setIsDragging] = React.useState(false);
    const [startY, setStartY] = React.useState(0);
    const [currentY, setCurrentY] = React.useState(0);
    const [isClosingByDrag, setIsClosingByDrag] = React.useState(false);
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (context.innerOpen) {
        setCurrentY(0);
        setIsClosingByDrag(false);
      }
    }, [context.innerOpen]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggable) return;
      setIsDragging(true);
      setStartY(e.clientY - currentY);
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !draggable) return;
      const newY = e.clientY - startY;
      setCurrentY(newY > 0 ? newY : 0);
    };

    const handlePointerUp = () => {
      if (!draggable) return;
      setIsDragging(false);
      if (currentY > (contentRef.current?.offsetHeight || 0) / 2) {
        setIsClosingByDrag(true);
        context.setInnerOpen(false);
      } else {
        setCurrentY(0);
      }
    };

    return (
      <DialogPortal>
        <DialogPrimitive.Popup
          ref={ref}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
            style={{
            transform: `translate(-50%, calc(-50% + ${currentY}px))`,
            transition: isDragging ? "none" : "transform 0.3s ease-out",
          }}
          className={cn(
            "fixed start-[50%] top-[50%] z-[60] grid w-full max-w-lg ltr:translate-x-[-50%] rtl:translate-x-[50%] translate-y-[-45%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200",
            isClosingByDrag
              ? "data-ending-style:transition-none data-ending-style:opacity-0"
              : "transition-[transform,opacity] data-starting-style:opacity-0 data-ending-style:opacity-0 data-starting-style:scale-95 data-ending-style:scale-95",
            draggable && "",
            className,
          )}
          {...props}
        >
          <div ref={contentRef}>{children}</div>
          <InnerDialogClose className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-popup-open:bg-accent data-popup-open:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </InnerDialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    );
  },
);
InnerDialogContent.displayName = "InnerDialogContent";

const InnerDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-start",
      className,
    )}
    {...props}
  />
);
InnerDialogHeader.displayName = "InnerDialogHeader";

const InnerDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:space-x-2", className)}
    {...props}
  />
);
InnerDialogFooter.displayName = "InnerDialogFooter";

const InnerDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
InnerDialogTitle.displayName = "InnerDialogTitle";

const InnerDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
InnerDialogDescription.displayName = "InnerDialogDescription";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-start",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export type { InnerDialogContentProps };
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  InnerDialog,
  InnerDialogTrigger,
  InnerDialogContent,
  InnerDialogHeader,
  InnerDialogFooter,
  InnerDialogTitle,
  InnerDialogDescription,
  InnerDialogClose,
  DialogPortal,
  DialogOverlay,
};
