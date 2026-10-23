// A wheel gesture belongs to where it started: wheel over a knob and it turns, but a page scroll that started
// elsewhere passes over knobs (and the effect screens) without changing them. A pause ends the gesture.

/** Wheel events further apart than this start a new gesture. */
const GAP_MS = 300

let owner: EventTarget | null = null
let last = 0

// Capture phase, so the gesture's owner is set before any control's own handler runs.
window.addEventListener('wheel', (e) => {
  if (e.timeStamp - last > GAP_MS) owner = e.target
  last = e.timeStamp
}, { capture: true, passive: true })

/** Whether the wheel gesture going on belongs to `node`, i.e. it started on it (or inside it). */
export const wheelIsFor = (node: Element) => owner instanceof Node && node.contains(owner)

/** A native wheel listener that may stop the page scrolling (React's is passive); returns the cleanup. */
export function onOwnWheel(node: Element, handle: (e: WheelEvent) => void) {
  const listener = (e: Event) => {
    if (wheelIsFor(node)) handle(e as WheelEvent)
  }
  node.addEventListener('wheel', listener, { passive: false })
  return () => node.removeEventListener('wheel', listener)
}
