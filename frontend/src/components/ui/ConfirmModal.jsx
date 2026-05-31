import React, { useEffect } from 'react';

/**
 * Reusable Confirmation Modal component.
 * 
 * @param {object} props
 * @param {boolean} props.isOpen - Controls visibility.
 * @param {string} props.title - Modal header title.
 * @param {string} props.message - Body content/warning text.
 * @param {string} [props.confirmText="Confirm"] - Text for the confirm button.
 * @param {string} [props.cancelText="Cancel"] - Text for the cancel button.
 * @param {boolean} [props.isDestructive=true] - Styles confirm button with error colors if true.
 * @param {Function} props.onConfirm - Callback when confirm is clicked.
 * @param {Function} props.onCancel - Callback when cancel or backdrop is clicked.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = true,
  onConfirm,
  onCancel
}) {
  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity" 
        onClick={onCancel}
      />
      
      {/* Modal Dialog */}
      <div className="relative bg-surface-container-high border border-white/10 shadow-2xl rounded-xl w-full max-w-md mx-4 overflow-hidden animate-enter">
        <div className="p-6 flex flex-col gap-4">
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isDestructive ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
              <span className="material-symbols-outlined">
                {isDestructive ? 'warning' : 'info'}
              </span>
            </div>
            <h2 className="font-headline-md text-[18px] text-on-surface">
              {title}
            </h2>
          </div>
          
          <p className="font-body-md text-on-surface-variant leading-relaxed pl-[52px]">
            {message}
          </p>
        </div>
        
        {/* Footer Actions */}
        <div className="bg-surface/50 border-t border-white/5 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-label-md text-on-surface-variant hover:bg-white/5 hover:text-on-surface transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-lg font-label-md transition-all shadow-sm flex items-center gap-2 ${
              isDestructive 
                ? 'bg-error text-on-error hover:bg-error-container hover:text-on-error-container' 
                : 'bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container hover-glow'
            }`}
          >
            {isDestructive && <span className="material-symbols-outlined text-[16px]">delete</span>}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
