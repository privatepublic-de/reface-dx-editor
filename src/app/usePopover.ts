// A popup under a button in the top bar: Escape or a press outside it closes it, and Escape gives focus back
// to the button that opened it.
import { useEffect, useRef, useState } from 'react'

export function usePopover() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      // a <dialog> (confirm, Help) opened from the popup is outside it but must not close it
      if (!anchor.current?.contains(e.target as Node) && !(e.target as Element).closest?.('dialog')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      anchor.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, anchor }
}
