import { contextBridge, ipcRenderer } from 'electron'

type Ok<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Ok<T>
  if (!res || typeof res !== 'object') {
    throw new Error(`IPC ${channel} returned an unexpected payload`)
  }
  if (!res.ok) {
    const err = new Error(res.error || `IPC ${channel} failed`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.data
}

const api = {
  settings: {
    get: () => call<any>('settings:get'),
    update: (patch: any) => call<any>('settings:update', patch),
    flush: () => call<boolean>('settings:flush')
  },
  github: {
    status: () => call<any>('github:status'),
    rate: (force = false) => call<any>('github:rate', force),
    login: (token: string) => call<any>('github:login', token),
    loginWithCli: () => call<any>('github:loginWithCli'),
    logout: () => call<boolean>('github:logout'),
    user: (login: string) => call<any>('github:user', login),
    search: (q: string, opts?: any) => call<any>('github:search', q, opts || {}),
    searchRaw: (q: string, opts?: any) => call<any>('github:searchRaw', q, opts || {}),
    repoDetail: (fullName: string, opts?: any) => call<any>('github:repoDetail', fullName, opts || {}),
    skillFile: (fullName: string, branch: string, path: string) =>
      call<string>('github:skillFile', fullName, branch, path),
    translate: (text: string, key?: string) => call<string | null>('github:translate', text, key),
    translateBatch: (items: { key: string; text: string }[]) =>
      call<Record<string, string>>('github:translateBatch', items)
  },
  catalog: {
    curated: () => call<any>('catalog:curated'),
    sections: () => call<any>('catalog:sections'),
    refresh: (limit?: number) => call<any>('catalog:refresh', limit)
  },
  library: {
    list: () => call<any[]>('library:list'),
    get: (id: string) => call<any>('library:get', id),
    add: (fullName: string) => call<any>('library:add', fullName),
    addLocal: (dir: string) => call<any>('library:addLocal', dir),
    sync: (id: string) => call<any>('library:sync', id),
    remove: (id: string, deleteFiles = true) => call<any>('library:remove', id, deleteFiles),
    readme: (id: string) => call<string>('library:readme', id)
  },
  agents: {
    list: () => call<any[]>('agents:list'),
    active: () => call<any[]>('agents:active'),
    project: (dir: string) => call<any[]>('agents:project', dir),
    scan: (agentId: string) => call<any[]>('agents:scan', agentId),
    resolveDir: (agentId: string) => call<string | null>('agents:resolveDir', agentId),
    toggle: (agentId: string, enabled: boolean) => call<any[]>('agents:toggle', agentId, enabled),
    setEnabled: (ids: string[]) => call<any[]>('agents:setEnabled', ids),
    addCustom: (name: string, path: string) => call<any[]>('agents:addCustom', name, path),
    removeCustom: (id: string) => call<any[]>('agents:removeCustom', id),
    removeRaw: (p: string) => call<boolean>('agents:removeRaw', p),
    reveal: (p: string) => call<boolean>('agents:reveal', p)
  },
  install: {
    run: (req: any) => call<any>('install:run', req),
    uninstall: (skillId: string, agentId: string) => call<boolean>('install:uninstall', skillId, agentId),
    uninstallAll: (skillId: string) => call<number>('install:uninstallAll', skillId),
    records: () => call<any[]>('install:records'),
    map: () => call<Record<string, string[]>>('install:map'),
    list: () => call<any[]>('install:list'),
    managedByAgent: () => call<Record<string, number>>('install:managedByAgent')
  },
  board: {
    growth: (days: 1 | 7 | 30, limit?: number, useApi?: boolean, apiBudget?: number) =>
      call<any[]>('board:growth', days, limit, useApi, apiBudget),
    top: (limit?: number) => call<any[]>('board:top', limit),
    coverage: () => call<any>('board:coverage'),
    growthOne: (fullName: string, days: 1 | 7 | 30) => call<number>('board:growthOne', fullName, days)
  },
  profile: {
    stats: () => call<any>('profile:stats'),
    activity: () => call<any[]>('profile:activity'),
    refresh: () => call<any>('profile:refresh'),
    starred: () => call<any[]>('profile:starred')
  },
  system: {
    boot: () => call<{ initialView: string | null; initialRepo: string | null; initialQuery: string | null; argv: string[] }>('system:boot'),
    stats: () => call<any>('system:stats'),
    testTranslation: () => call<any>('system:testTranslation'),
    pickDirectory: () => call<string | null>('system:pickDirectory'),
    openPath: (p: string) => call<boolean>('system:openPath', p),
    openExternal: (url: string) => call<boolean>('system:openExternal', url),
    checkPaths: (paths: string[]) => call<any[]>('system:checkPaths', paths),
    parseSkill: (text: string) => call<any>('system:parseSkill', text),
    agentName: (id: string) => call<string>('system:agentName', id)
  },
  on: (channel: string, cb: (payload: any) => void) => {
    const listener = (_e: unknown, payload: any): void => cb(payload)
    ipcRenderer.on(channel, listener as any)
    return () => ipcRenderer.removeListener(channel, listener as any)
  }
}

contextBridge.exposeInMainWorld('skillhub', api)

export type SkillHubApi = typeof api
