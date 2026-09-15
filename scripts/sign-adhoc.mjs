#!/usr/bin/env node
/**
 * Ad-hoc sign the macOS bundle after packing.
 *
 *   called automatically as an electron-builder `afterPack` hook
 *
 * Without any signature the bundle keeps the identity it inherited from the
 * Electron distribution (`Identifier=Electron`), and macOS reports a downloaded
 * copy as **damaged** — "move it to the Trash" — which reads as a corrupt
 * download. An ad-hoc signature replaces that with the ordinary
 * "unidentified developer" prompt, which has a documented way past it
 * (right-click → Open).
 *
 * This is NOT a substitute for a Developer ID signature and notarisation; it
 * only makes the first launch survivable for people downloading from GitHub.
 */
import { execFileSync } from 'node:child_process'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  const id = context.packager.appInfo.id || 'com.dialling.skillhub'
  try {
    // Nested frameworks first, then the outer bundle.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--identifier', id, appPath], {
      stdio: 'pipe'
    })
    console.log(`  • ad-hoc signed  ${appPath}  (${id})`)
  } catch (err) {
    console.warn(`  • ad-hoc signing failed: ${err.message.split('\n')[0]}`)
  }
}
