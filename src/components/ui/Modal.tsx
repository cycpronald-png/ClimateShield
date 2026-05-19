import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  children,
  title,
  description,
  maxWidth = 'lg',
  showCloseButton = true,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay data-testid="modal-overlay" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          aria-modal="true"
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full p-6 ${maxWidthClasses[maxWidth]}`}
        >
          {showCloseButton && (
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="absolute right-4 top-4 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          )}
          {title && (
            <Dialog.Title className="font-semibold text-lg">
              {title}
            </Dialog.Title>
          )}
          <Dialog.Description className="text-sm text-muted-foreground">
            {description ?? ''}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
