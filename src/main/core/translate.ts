import { cache, settings } from './db'
import { m } from './msg'

export interface TranslationProvider {
  baseUrl: string
  apiKey: string
  model: string
}

export function provider(): TranslationProvider | null {
  const t = settings.get().translation
  if (!t.enabled || !t.apiKey || !t.baseUrl) return null
  return { baseUrl: t.baseUrl.replace(/\/+$/, ''), apiKey: t.apiKey, model: t.model || 'deepseek-chat' }
}

export function translationAvailable(): boolean {
  return provider() !== null
}

const SYSTEM_PROMPT =
  'You are a technical translator for a developer tool catalog. Translate the given English ' +
  'description of an AI agent skill or GitHub repository into concise, natural Simplified ' +
  'Chinese. Keep product names, CLI commands and file names in their original form. ' +
  'Return ONLY the translation, no quotes, no explanation, max 80 Chinese characters.'

/** Translate one string, with a durable cache. Returns null when unavailable. */
export async function translate(text: string, cacheKey?: string): Promise<string | null> {
  const p = provider()
  if (!p || !text || !text.trim()) return null
  const key = cacheKey || `t:${hash(text)}`
  const hit = cache.get().translate[key]
  if (hit && Date.now() - hit.at < 30 * 24 * 3600_000) return hit.zh

  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`
      },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 2000) }
        ]
      })
    })
    if (!res.ok) return null
    const body: any = await res.json()
    const zh: string | undefined = body?.choices?.[0]?.message?.content?.trim()
    if (!zh) return null
    cache.update((d) => {
      d.translate[key] = { at: Date.now(), zh }
    })
    return zh
  } catch {
    return null
  }
}

export async function translateBatch(
  items: { key: string; text: string }[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!translationAvailable()) return out
  const concurrency = 4
  let cursor = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]
        const zh = await translate(item.text, item.key)
        if (zh) out[item.key] = zh
      }
    })
  )
  return out
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Verify credentials against the configured endpoint. */
export async function testProvider(): Promise<{ ok: boolean; message: string }> {
  const p = provider()
  if (!p) return { ok: false, message: m('translate.notConfigured') }
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }]
      })
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, message: `HTTP ${res.status} ${txt.slice(0, 200)}` }
    }
    return { ok: true, message: m('translate.ok') }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
