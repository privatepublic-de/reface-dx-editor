// A render error would otherwise leave a blank page. This says so, and offers the voice being edited as a .syx file
// first, since a reload loses edits that aren't stored. After hydrasynth-editor's ErrorBoundary.
import { Component, type ReactNode } from 'react'
import { exportSyx, fileName } from '../library/library'
import { download } from './download'
import { useEditor } from './store'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  private saveVoice = () => {
    const voice = useEditor.getState().voice
    if (voice) download(fileName(voice), exportSyx([voice]))
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const voice = useEditor.getState().voice
    return (
      <div className="about-dialog error-page" role="alert">
        <h2>Something went wrong</h2>
        <p>The editor ran into an error it can’t recover from.</p>
        {voice && <p>Save the voice as a .syx file before reloading; Import .syx in the Library brings it back.</p>}
        <details>
          <summary>Error details</summary>
          {/* Chrome's stack starts with the message, Firefox's doesn't. */}
          <pre className="about-dialog__text">{error.stack?.includes(error.message) ? error.stack : `${error.message}\n${error.stack ?? ''}`}</pre>
        </details>
        <p className="popup__row">
          {voice && <button type="button" onClick={this.saveVoice}>Save the voice as a file</button>}
          <button type="button" className="primary" onClick={() => location.reload()}>Reload</button>
        </p>
      </div>
    )
  }
}
