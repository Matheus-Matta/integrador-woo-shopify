'use client';

import React, { createContext, useCallback, useContext } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';

export type ToastType = 'ok' | 'error' | 'queue';

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = useCallback((message: string, type: ToastType = 'ok') => {
    if (type === 'error') {
      sonnerToast.error(message);
    } else if (type === 'queue') {
      sonnerToast.info(message);
    } else {
      sonnerToast.success(message);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster 
        position="bottom-right" 
        richColors 
        closeButton
        theme="dark"
        toastOptions={{
          style: {
            background: '#161b27',
            border: '1px solid #1e2535',
            color: '#f3f4f6',
          }
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
