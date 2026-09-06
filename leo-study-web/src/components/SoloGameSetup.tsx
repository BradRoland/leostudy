import { useEffect, useRef } from 'react'
import { AcademyIcon } from './AcademyIcon'
import './WorkspacePolish.css'

type Filter = 'all' | 'penal' | 'hs' | 'vehicle'
type Selection = { filter: Filter; duration: 15 | 30 | 60 }
type Props = {
  mode: 'matching' | 'speed'
  selection: Selection
  onChange: (selection: Selection) => void
  onCancel: () => void
  onStart: () => void
  disabled?: boolean
}

export function SoloGameSetup({ mode, selection, onChange, onCancel, onStart, disabled = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = mode === 'matching' ? 'Matching Settings' : 'Speed Test Settings'
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    element?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    return () => {
      element?.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return <dialog ref={dialog} className="academy-game-setup" aria-labelledby="solo-setup-title" aria-describedby="solo-setup-description" onCancel={event => { event.preventDefault(); onCancel() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel()
  }}>
    <div className="solo-setup-body"><header className="solo-setup-heading"><span className="solo-setup-icon"><AcademyIcon name={mode === 'matching' ? 'flashcards' : 'speed'}/></span><p className="eyebrow">YOUR NEXT CHALLENGE</p><h2 id="solo-setup-title">{title}</h2><p id="solo-setup-description">{mode === 'matching' ? 'Build recall by pairing each code with its definition.' : 'Practice quick decisions while keeping accuracy first.'}</p></header>
    <fieldset className="solo-setup-options"><legend>Choose your code set</legend><div>{([['all', 'All codes'], ['penal', 'Penal Code'], ['hs', 'Health & Safety'], ['vehicle', 'Vehicle Code']] as const).map(([filter, label]) => <button type="button" key={filter} aria-pressed={selection.filter === filter} onClick={() => onChange({ ...selection, filter })}>{label}</button>)}</div></fieldset>
    <fieldset className="solo-setup-options"><legend>Set your round length</legend><div className="solo-duration-options">{([15, 30, 60] as const).map(duration => <button type="button" key={duration} aria-pressed={selection.duration === duration} onClick={() => onChange({ ...selection, duration })}><strong>{duration}<small> seconds</small></strong><span>{duration === 15 ? 'Quick warm-up' : duration === 30 ? 'Build a rhythm' : 'Go a little deeper'}</span></button>)}</div></fieldset>
    {disabled ? <p className="solo-setup-notice" role="status">Questions are still loading. You can start as soon as they are ready.</p> : <p className="solo-setup-notice">Your score and progress are saved after each completed round.</p>}
    </div><footer className="solo-setup-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={disabled} onClick={onStart}>Start<AcademyIcon name="arrow"/></button></footer>
  </dialog>
}
