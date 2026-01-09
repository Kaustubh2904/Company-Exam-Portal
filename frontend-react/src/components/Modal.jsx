import React from 'react';

export default function Modal({
  isOpen,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black opacity-60"
        onClick={onClose}
      ></div>
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-lg w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="p-6 text-slate-300">{children}</div>
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}