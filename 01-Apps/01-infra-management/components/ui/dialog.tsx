"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const widths = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
} as const;

export function AppDialog({
  open,
  onClose,
  title,
  description,
  width = "md",
  headerActions,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  width?: keyof typeof widths;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm transition-opacity duration-200 data-closed:opacity-0"
      />
      <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel
            transition
            className={`w-full ${widths[width]} overflow-hidden rounded-xl bg-white text-left shadow-2xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-gray-900 dark:ring-1 dark:ring-white/10`}
          >
            <div className="flex items-start gap-4 border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-white/10">
              <div className="mr-auto min-w-0">
                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                  {title}
                </DialogTitle>
                {description && (
                  <DialogDescription className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {description}
                  </DialogDescription>
                )}
              </div>
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
              >
                <span className="sr-only">Close dialog</span>
                <XMarkIcon className="size-5" aria-hidden="true" />
              </button>
            </div>
            {children}
            {footer && (
              <div className="border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-white/10">
                {footer}
              </div>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
