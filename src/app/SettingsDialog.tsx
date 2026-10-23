// The DX's own settings (SYSTEM, reface Data List p. 8): what its FUNCTION pages and keyboard settings hold. Each
// change goes to the DX at once and stays there, as when set on the DX (FINDINGS Q11); they aren't part of Undo.
// Read again whenever the dialog opens, since they may have been changed on the DX.
import { useEffect, useRef } from 'react'
import type { Param } from '../params/param'
import { masterTuneBytes, masterTuneCents, systemParam, tempoBpm, tempoBytes } from '../params/system'
import { Knob } from './controls/Knob'
import { Switch } from './controls/Switch'
import { useEditor } from './store'

/** Master Tune as raw 0.1-cent steps around 1024, shown in Hz as the DX shows it (414.8–466.8 Hz). */
const hzOf = (raw: number) => 440 * 2 ** ((raw - 1024) / 10 / 1200)
const TUNE: Param = {
  offset: 0x02, key: 'masterTune', label: 'Master tune', min: 0, max: 2047, center: 1024,
  format: (raw) => `${hzOf(raw).toFixed(1)} Hz`,
  // "442" (Hz) or "+5 c" (cents)
  parse: (t) => {
    const n = Number.parseFloat(t.replace(',', '.'))
    if (!Number.isFinite(n)) return null
    const cents = /c/i.test(t) || Math.abs(n) <= 110 ? n : 1200 * Math.log2(n / 440)
    return Math.round(cents * 10) + 1024
  },
}
const TEMPO: Param = { offset: 0x08, key: 'tempo', label: 'Tempo', min: 30, max: 300, format: (v) => `${v} BPM` }
const OFF_ON = ['off', 'on'] as const
const noGesture = () => {}

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const system = useEditor((s) => s.system)
  const demo = useEditor((s) => s.status === 'demo')
  const { setSystemValue, refreshSystem } = useEditor.getState()
  useEffect(() => {
    ref.current?.showModal()
    void refreshSystem()
  }, [])
  const at = (offset: number) => system?.[offset] ?? 0
  const tuneRaw = system ? Math.round(masterTuneCents(system) * 10) + 1024 : 1024
  const toggle = (offset: number, label: string) => (
    <Switch label={label} steps={OFF_ON} value={at(offset)} onChange={(v) => setSystemValue(offset, v)} />
  )
  return (
    <dialog ref={ref} className="about-dialog settings-dialog" onClose={onClose} aria-label="DX settings">
      <form method="dialog" className="about-dialog__close">
        <button aria-label="Close">×</button>
      </form>
      <h2>DX settings</h2>
      <p className="dim">The DX’s own settings, as on its FUNCTION pages. Changes go to the DX at once and stay there{demo ? ' (here: the demo’s pretend DX)' : ''}. Undo doesn’t cover them.</p>
      {!system ? (
        <p className="dim">Reading…</p>
      ) : (
        <>
          <h3>MIDI</h3>
          <div className="settings-row">
            <label className="settings-field">
              <span className="control__label">Receive (RV CH)</span>
              <select value={at(0x01)} onChange={(e) => setSystemValue(0x01, Number(e.target.value))}>
                {Array.from({ length: 16 }, (_, ch) => <option key={ch} value={ch}>{ch + 1}</option>)}
                <option value={0x10}>all</option>
              </select>
            </label>
            <label className="settings-field">
              <span className="control__label">Transmit (TR CH)</span>
              <select value={at(0x00)} onChange={(e) => setSystemValue(0x00, Number(e.target.value))}>
                {Array.from({ length: 16 }, (_, ch) => <option key={ch} value={ch}>{ch + 1}</option>)}
                <option value={0x7f}>off</option>
              </select>
            </label>
            {toggle(0x0e, 'MIDI Control')}
            {toggle(0x06, 'Local')}
          </div>
          <p className="note">
            The editor plays on the receive channel and listens on the transmit channel. With TR CH off, voices chosen on the DX aren’t followed;
            with MIDI Control off, knob moves there don’t come through; with Local off, the DX’s keys play only over MIDI.
          </p>

          <h3>Tuning and tempo</h3>
          <div className="settings-row">
            <Knob param={TUNE} title="Master tune" value={tuneRaw} defaultValue={1024} onGesture={noGesture}
              onChange={(raw) => setSystemValue(0x02, masterTuneBytes((raw - 1024) / 10))} />
            <Knob param={systemParam('masterTranspose')} title="Transpose" value={at(0x07)} defaultValue={0x40} onGesture={noGesture}
              onChange={(v) => setSystemValue(0x07, v)} />
            <Knob param={TEMPO} title="Tempo" value={tempoBpm(system)} defaultValue={120} onGesture={noGesture}
              onChange={(v) => setSystemValue(0x08, tempoBytes(v))} />
          </div>
          <p className="note">Master tune {((tuneRaw - 1024) / 10).toFixed(1)} cents (type Hz, or cents with “c”). The tempo is the Phrase Looper’s.</p>

          <h3>The instrument</h3>
          <div className="settings-row">
            <Switch label="Sustain pedal" steps={['FC3', 'FC4/5']} value={at(0x0b)} onChange={(v) => setSystemValue(0x0b, v)}
              note="FC3 for a pedal with half-damper, FC4/5 for a foot switch" />
            {toggle(0x0d, 'Speakers')}
            {toggle(0x0c, 'Auto power-off')}
            <Knob param={systemParam('contrast')} title="LCD contrast" value={at(0x0a)} defaultValue={at(0x0a)} onGesture={noGesture}
              onChange={(v) => setSystemValue(0x0a, v)} />
          </div>
        </>
      )}
    </dialog>
  )
}
