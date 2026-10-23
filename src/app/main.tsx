import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './ui-base.css'
import './app.css'
import { useEditor } from './store'

if (new URLSearchParams(location.search).has('demo')) void useEditor.getState().startDemo()
// For poking at the store (and the demo's fake DX) in the browser during development, never in a build.
if (import.meta.env.DEV) Object.assign(window, { editorStore: useEditor })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
