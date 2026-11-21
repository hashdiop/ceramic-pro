"use client";

import { useEffect } from "react";

/**
 * Panneau de formulaire : plein écran sur mobile, fenêtre centrée sur ordinateur.
 */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex w-full flex-col bg-slate-50 sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl sm:shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-2xl">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost min-h-9 px-3">
            Fermer
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
