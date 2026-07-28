import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    return id;
  }, [dismissToast]);

  const toast = useCallback((message, type = 'info') => showToast(message, type), [showToast]);
  toast.success = (message) => showToast(message, 'success');
  toast.error = (message) => showToast(message instanceof Error ? message.message : message || 'Something went wrong. Please try again.', 'error');

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg transition ${
              item.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : item.type === 'success'
                ? 'border-teal-200 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{item.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                aria-label="Dismiss"
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export default ToastContext;
