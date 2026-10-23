// A switch: a row of segmented buttons, or one toggle. After nord-lead-2-editor's Switch, without its LED columns.

export interface SwitchProps {
  label: string
  /** what each step shows, index = value - min */
  steps: readonly string[]
  value: number
  min?: number
  /** one on/off button instead of a row */
  toggle?: boolean
  /** a longer explanation, as the tooltip */
  note?: string
  flash?: boolean
  disabled?: boolean
  /** the label is shown for screen readers only (the box already says it) */
  hideLabel?: boolean
  /** what the box says, for screen readers: "OP2" */
  context?: string
  onChange(value: number): void
}

export function Switch({ label, steps, value, min = 0, toggle, note, flash, disabled, hideLabel, context, onChange }: SwitchProps) {
  const name = context ? `${context} ${label}` : label
  const cls = `control switch${toggle ? ' switch--toggle' : ''}${flash ? ' control--touched' : ''}`
  if (toggle)
    return (
      <div className={cls} title={note}>
        <button type="button" className={`switch__toggle${value ? ' on' : ''}`} aria-pressed={value === 1} aria-label={context ? name : undefined} disabled={disabled} onClick={() => onChange(value ? 0 : 1)}>
          <span className="led" aria-hidden />
          {label}
        </button>
      </div>
    )
  return (
    <div className={cls} role="group" aria-label={name} title={note}>
      <span className={hideLabel ? 'visually-hidden' : 'control__label'}>{label}</span>
      <div className="switch__steps">
        {steps.map((name, i) => (
          <button key={i} type="button" className={`switch__step${i + min === value ? ' on' : ''}`} aria-pressed={i + min === value} disabled={disabled}
            onClick={() => i + min !== value && onChange(i + min)}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
