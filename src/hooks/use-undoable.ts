import { toast } from "sonner";
import i18n from "@/i18n";

/**
 * Show a toast with an "Undo" action for `duration` ms.
 * Call it right AFTER the destructive action.
 */
export function undoableToast(opts: {
  message: string;
  undo: () => Promise<void> | void;
  duration?: number;
}) {
  const t = i18n.t.bind(i18n);
  toast(opts.message, {
    duration: opts.duration ?? 8000,
    action: {
      label: t("common.undo"),
      onClick: () => {
        Promise.resolve(opts.undo())
          .then(() => toast.success(t("common.undone")))
          .catch((e: any) => toast.error(e?.message || t("errors.undoFailed")));
      },
    },
  });
}
