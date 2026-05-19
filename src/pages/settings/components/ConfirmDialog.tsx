import { useRef, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmLoadingLabel?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  password?: string;
  onPasswordChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmLoadingLabel,
  passwordLabel,
  passwordPlaceholder,
  password,
  onPasswordChange,
  onCancel,
  onConfirm,
  loading,
  children,
}: ConfirmDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const hasPassword = !!passwordLabel && onPasswordChange !== undefined;

  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} maxWidth="sm">
      <div className="mt-4 space-y-4">
        {hasPassword && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {passwordLabel}
            </label>
            <Input
              ref={inputRef}
              type="password"
              placeholder={passwordPlaceholder}
              value={password || ''}
              onChange={(e) => onPasswordChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) onConfirm();
                if (e.key === "Escape") onCancel();
              }}
              disabled={loading}
              aria-label={passwordLabel}
            />
          </div>
        )}

        {children && <div className="space-y-3">{children}</div>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading || (hasPassword && !password?.trim())}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {confirmLoadingLabel || confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
