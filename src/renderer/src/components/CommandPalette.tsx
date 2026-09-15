import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Store, Library, Trophy, Bot, User, Settings, Languages, RefreshCw, CornerDownLeft } from 'lucide-react'
import { useStore, type ViewKey } from '../store'

interface Item {
  id: string
  label: string
  sub?: string
  group: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette(): React.JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const setView = useStore((s) => s.setView)
  const toggleLang = useStore((s) => s.toggleLang)
  const runSearch = useStore((s) => s.runSearch)
  const openDetail = useStore((s) => s.openDetail)
  const library = useStore((s) => s.library)
  const catalog = useStore((s) => s.catalogRepos)
  const refreshRate = useStore((s) => s.refreshRate)

  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const nav: { id: ViewKey; key: string; icon: React.ReactNode }[] = [
      { id: 'store', key: 'palette.goStore', icon: <Store size={14} /> },
      { id: 'library', key: 'palette.goLibrary', icon: <Library size={14} /> },
      { id: 'charts', key: 'palette.goCharts', icon: <Trophy size={14} /> },
      { id: 'agents', key: 'palette.goAgents', icon: <Bot size={14} /> },
      { id: 'profile', key: 'palette.goProfile', icon: <User size={14} /> },
      { id: 'settings', key: 'palette.goSettings', icon: <Settings size={14} /> }
    ]
    const commands: Item[] = nav.map((n) => ({
      id: `nav:${n.id}`,
      label: t(n.key),
      group: t('palette.commands'),
      icon: n.icon,
      run: () => {
        setView(n.id)
        setPalette(false)
      }
    }))
    commands.push({
      id: 'cmd:lang',
      label: t('palette.toggleLang'),
      group: t('palette.commands'),
      sub: t('lang.switchTo'),
      icon: <Languages size={14} />,
      run: () => {
        void toggleLang()
        setPalette(false)
      }
    })
    commands.push({
      id: 'cmd:refresh',
      label: t('palette.refresh'),
      group: t('palette.commands'),
      icon: <RefreshCw size={14} />,
      run: () => {
        void refreshRate(true)
        setPalette(false)
      }
    })

    const term = q.trim().toLowerCase()
    const localHits: Item[] = []
    const seen = new Set<string>()
    for (const item of library) {
      if (term && !item.fullName.toLowerCase().includes(term)) continue
      seen.add(item.fullName)
      localHits.push({
        id: `lib:${item.id}`,
        label: item.meta.name,
        sub: item.fullName,
        group: t('nav.library'),
        icon: <Library size={14} />,
        run: () => {
          openDetail(item.fullName)
          setView('store')
          setPalette(false)
        }
      })
    }
    for (const repo of catalog) {
      if (!term) break
      if (seen.has(repo.fullName)) continue
      if (
        !repo.fullName.toLowerCase().includes(term) &&
        !(repo.descriptionEn || '').toLowerCase().includes(term) &&
        !(repo.descriptionZh || '').includes(q.trim())
      )
        continue
      seen.add(repo.fullName)
      localHits.push({
        id: `cat:${repo.fullName}`,
        label: repo.name,
        sub: repo.fullName,
        group: t('store.curatedCatalog'),
        icon: <Store size={14} />,
        run: () => {
          openDetail(repo.fullName)
          setView('store')
          setPalette(false)
        }
      })
      if (localHits.length > 30) break
    }

    const out = term
      ? commands.filter((c) => c.label.toLowerCase().includes(term) || c.sub?.toLowerCase().includes(term))
      : commands
    const result = [...out, ...localHits.slice(0, 24)]
    if (term) {
      result.push({
        id: 'cmd:search',
        label: t('palette.searchGithub', { q: q.trim() }),
        group: t('palette.commands'),
        icon: <Search size={14} />,
        run: () => {
          setView('store')
          void runSearch(q.trim())
          setPalette(false)
        }
      })
    }
    return result
  }, [q, t, lang, library, catalog, setView, setPalette, toggleLang, refreshRate, openDetail, runSearch])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, items.length - 1)))
  }, [items.length])

  if (!open) return null

  const grouped: { group: string; items: Item[] }[] = []
  for (const item of items) {
    const last = grouped[grouped.length - 1]
    if (last && last.group === item.group) last.items.push(item)
    else grouped.push({ group: item.group, items: [item] })
  }

  let flatIndex = -1

  return (
    <div className="overlay" onClick={() => setPalette(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} className="dim" />
          <input
            ref={inputRef}
            value={q}
            spellCheck={false}
            placeholder={t('palette.placeholder')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                items[cursor]?.run()
              } else if (e.key === 'Escape') {
                setPalette(false)
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list" ref={listRef}>
          {items.length === 0 && <div className="palette-item dim">{t('palette.noMatch')}</div>}
          {grouped.map((g) => (
            <div key={g.group}>
              <div className="palette-group">{g.group}</div>
              {g.items.map((item) => {
                flatIndex++
                const idx = flatIndex
                return (
                  <button
                    key={item.id}
                    className={`palette-item ${idx === cursor ? 'sel' : ''}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={item.run}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.sub && <span className="sub">{item.sub}</span>}
                    {idx === cursor && <CornerDownLeft size={12} className="dim" style={{ marginLeft: 6 }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
