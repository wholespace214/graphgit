import { useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

export function WidthHandle({
  label,
  axis = 'x',
  overlay,
  style,
  onDrag,
  onReset,
}: {
  label: string
  axis?: 'x' | 'y'
  overlay?: boolean
  style?: CSSProperties
  onDrag: (delta: number) => void
  onReset: () => void
}) {
  const origin = useRef(0)
  const horizontal = axis === 'y'

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.classList.remove('width-dragging', 'height-dragging')
  }

  return (
    <div
      className={overlay ? 'width-handle overlay' : horizontal ? 'width-handle horizontal' : 'width-handle'}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={label}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        origin.current = horizontal ? event.clientY : event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.classList.add(horizontal ? 'height-dragging' : 'width-dragging')
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const point = horizontal ? event.clientY : event.clientX
        const delta = point - origin.current
        if (delta === 0) return
        origin.current = point
        onDrag(delta)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        event.preventDefault()
        onReset()
      }}
      onKeyDown={(event) => {
        if (horizontal) {
          if (event.key === 'ArrowUp') onDrag(-16)
          if (event.key === 'ArrowDown') onDrag(16)
          return
        }
        if (event.key === 'ArrowLeft') onDrag(-16)
        if (event.key === 'ArrowRight') onDrag(16)
      }}
    />
  )
}
