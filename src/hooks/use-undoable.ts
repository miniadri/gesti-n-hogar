import { toast } from "sonner";

/**
 * Muestra un toast con una acción "Deshacer" durante `duration` ms.
 * Úsalo justo DESPUÉS de haber ejecutado la acción destructiva:
 *
 *   await doDelete(...);
 *   undoableToast({
 *     message: "Producto eliminado",
 *     undo: async () => { await doRestore(...); refresh(); },
 *   });
 */
export function undoableToast(opts: {
  message: string;
  undo: () => Promise<void> | void;
  duration?: number;
}) {
  toast(opts.message, {
    duration: opts.duration ?? 8000,
    action: {
      label: "Deshacer",
      onClick: () => {
        Promise.resolve(opts.undo())
          .then(() => toast.success("Acción deshecha"))
          .catch((e: any) => toast.error(e?.message || "No se pudo deshacer"));
      },
    },
  });
}
