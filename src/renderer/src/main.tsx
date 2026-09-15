import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/*
  Last-resort net. Preload rejects whenever an IPC handler reports failure, and a
  missed `.catch` anywhere would otherwise surface only as a console warning in
  devtools with the UI silently stuck. Log it and keep the window alive: a failed
  refresh must never take the app down.
*/
window.addEventListener('unhandledrejection', (e) => {
  console.error('[skillhub] unhandled rejection:', e.reason)
  e.preventDefault()
})

// Verification hook: a key that resolved to itself is a translation that never
// existed, and it would otherwise only be noticed as odd-looking text.
import { missingI18nKeys } from './i18n'
;(window as unknown as Record<string, unknown>).__missingI18nKeys = missingI18nKeys

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
