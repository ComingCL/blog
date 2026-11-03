"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { TriangleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Confirmation = { title: string; description: string; action: string; destructive?: boolean };
const ConfirmContext = createContext<((options: Confirmation) => Promise<boolean>) | null>(null);
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("Confirm provider missing");
  return confirm;
}
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const confirm = useCallback((value: Confirmation) => {
    resolver.current?.(false);
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOptions(value);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };
  useEffect(() => () => resolver.current?.(false), []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root
        open={!!options}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="nl-dialog-overlay" />
          <AlertDialog.Content
            className="nl-confirm-window"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
          >
            <div className="nl-confirm-icon">
              <TriangleAlert size={23} strokeWidth={1.5} />
            </div>
            <AlertDialog.Title className="nl-dialog-title">{options?.title}</AlertDialog.Title>
            <AlertDialog.Description className="nl-dialog-description">
              {options?.description}
            </AlertDialog.Description>
            <div className="nl-confirm-actions">
              <AlertDialog.Cancel className="nl-dialog-button" onClick={() => finish(false)}>
                再想想
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className={`nl-dialog-button ${options?.destructive ? "is-danger" : "is-primary"}`}
                onClick={() => finish(true)}
              >
                {options?.action}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
