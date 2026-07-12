import { useEffect, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error'

type ToastItem = {
  id: number
  kind: ToastKind
  message: ReactNode
}

type ToasterProps = {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  toastOptions?: {
    classNames?: Partial<Record<ToastKind, string>>
  }
}

const listeners = new Set<(items: ToastItem[]) => void>()
let items: ToastItem[] = []
let nextId = 1

function notify() {
  listeners.forEach((listener) => listener(items))
}

function removeToast(id: number) {
  items = items.filter((item) => item.id !== id)
  notify()
}

function addToast(kind: ToastKind, message: ReactNode) {
  const id = nextId++
  items = [{ id, kind, message }, ...items].slice(0, 5)
  notify()
  window.setTimeout(() => removeToast(id), 3500)
}

export const toast = {
  success: (message: ReactNode) => addToast('success', message),
  error: (message: ReactNode) => addToast('error', message),
}

function positionClass(position: ToasterProps['position']) {
  switch (position) {
    case 'top-left':
      return 'left-4 top-4'
    case 'bottom-right':
      return 'bottom-4 right-4'
    case 'bottom-left':
      return 'bottom-4 left-4'
    case 'top-right':
    default:
      return 'right-4 top-4'
  }
}

export function Toaster({ position = 'top-right', toastOptions }: ToasterProps) {
  const [visibleItems, setVisibleItems] = useState(items)

  useEffect(() => {
    listeners.add(setVisibleItems)
    return () => {
      listeners.delete(setVisibleItems)
    }
  }, [])

  return (
    <div
      data-sonner-toaster
      className={`fixed z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 ${positionClass(position)}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {visibleItems.map((item) => (
        <div
          key={item.id}
          data-sonner-toast
          className={`rounded-md px-4 py-3 text-sm font-medium shadow-lg ${toastOptions?.classNames?.[item.kind] ?? ''}`}
          role={item.kind === 'error' ? 'alert' : 'status'}
        >
          <span data-title>{item.message}</span>
        </div>
      ))}
    </div>
  )
}
