#!/usr/bin/env node
/**
 * Uninstall behaviour, checked against real files.
 *
 *   node scripts/uninstall-audit.mjs
 *
 * Every claim about deletion is checked on the filesystem rather than inferred
 * from a return value: "it said ok" and "the folder is gone" are different
 * statements, and the difference is the whole question.
 *
 * Uses a throwaway SKILLHUB_HOME and its own destination directories, so it
 * never touches a real agent directory. The one real read is the agent registry,
 * which is what makes the destinations realistic.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'skillhub-unaudit-'))
mkdirSync(join(home, 'state'), { recursive: true })
writeFileSync(join(home, 'state', 'settings.json'), JSON.stringify({ lang: 'zh', enabledAgents: [], firstRunDone: true }))

const chunks = readdirSync(join(root, 'out', 'main', 'chunks'))
const load = (prefix) => join(root, 'out', 'main', 'chunks', chunks.find((f) => f.startsWith(prefix)))

const probe = join(home, 'probe.cjs')
writeFileSync(
  probe,
  `
const I = require(${JSON.stringify(load('leaderboard'))})
const fs = require('node:fs')
const path = require('node:path')
const join = path.join
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = fs
const home = ${JSON.stringify(home)}
const A = path.join(home, 'agent-a')          // the destination
const B = path.join(home, 'agent-b')          // a second destination, same agent
const MINE = path.join(home, 'mine')          // the user's own folder, same name
const OTHER = path.join(home, 'other')        // an unrelated destination

const skill = { skillId: 'a/b::probe', fullName: 'a/b', path: '', name: 'probe' }
const other = { skillId: 'a/b::other', fullName: 'a/b', path: '', name: 'other' }
const src = path.join(home, 'src')
const srcOther = path.join(home, 'src-other')
for (const [dir, name] of [[src, 'probe'], [srcOther, 'other']]) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\\nname: ' + name + '\\ndescription: seeded\\n---\\n\\n# Body\\n')
}
const withSrc = (s, dir) => ({ ...s, localPath: dir })

const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((n) => !n.startsWith('.')).sort() : [])
const results = []
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) })

;(async () => {
  // --- "not installed: nothing to delete" -----------------------------------
  const nothing = I.uninstallAll('a/b::probe')
  check('卸载没装过的东西：返回 0，不报错', nothing.removed === 0 && nothing.refused.length === 0, JSON.stringify(nothing))
  check('而且没有删掉别的东西', !fs.existsSync(A))

  // --- the user's own folder of the same name must survive -------------------
  fs.mkdirSync(MINE, { recursive: true })
  fs.writeFileSync(path.join(MINE, 'SKILL.md'), '# the user\\'s own\\n')

  // --- install --------------------------------------------------------------
  const before = await I.installFromGithub({ skills: [withSrc(skill, src), withSrc(other, srcOther)], destinations: [A, B, OTHER] })
  check('安装成功', before.ok.length === 6, before.ok.length + ' placements, ' + JSON.stringify(before.errors.map(e => e.reason)))

  const probeDirs = [join(A, 'probe'), join(B, 'probe'), join(OTHER, 'probe')]
  check('三个目的地都有 probe', probeDirs.every((d) => existsSync(join(d, 'SKILL.md'))))
  check('卸载前：每个副本都有 marker', probeDirs.every((d) => existsSync(join(d, '.skillhub-install.json'))))
  check('卸载前：用户自己的同名文件夹没被动', fs.readFileSync(join(MINE, 'SKILL.md'), 'utf8') === '# the user\\'s own\\n')
  check('卸载前：另一个技能也在', existsSync(join(A, 'other', 'SKILL.md')))

  const recordsFor = (id) => I.installRecords().filter((r) => r.skillId === id)
  check('probe 有 3 条记录', recordsFor('a/b::probe').length === 3, recordsFor('a/b::probe').length)

  // --- uninstall from ONE agent, which owns A and B -------------------------
  const AID = 'path:' + A
  const BID = 'path:' + B
  const one = I.uninstallFrom('a/b::probe', AID)
  check('按单个智能体卸载成功', one.ok, JSON.stringify(one))
  check('  它自己的那一份被删了', !existsSync(join(A, 'probe')))
  check('  另一个目的地的同名技能还在', existsSync(join(OTHER, 'probe', 'SKILL.md')))
  check('  别的技能没被牵连', existsSync(join(A, 'other', 'SKILL.md')))
  check('  用户自己的文件夹还在', existsSync(join(MINE, 'SKILL.md')))
  check('  它的记录没了', recordsFor('a/b::probe').every((r) => r.linkPath !== join(A, 'probe')))
  check('  但另一份的记录还在', recordsFor('a/b::probe').some((r) => r.linkPath === join(OTHER, 'probe')))

  // --- uninstall everything -------------------------------------------------
  const all = I.uninstallAll('a/b::probe')
  // Two artifacts remained: agent-b's and other's. Agent-a's went a line ago.
  check('全部卸载返回删掉的数量', all.removed === 2, JSON.stringify(all))
  check('  所有副本都没了', probeDirs.every((d) => !fs.existsSync(d)))
  check('  一条记录都不剩', recordsFor('a/b::probe').length === 0, recordsFor('a/b::probe').length)
  check('  目的地目录本身还在（不是把目录删了）', existsSync(A) && existsSync(B) && existsSync(OTHER))
  check('  目的地里别的技能还在', existsSync(join(A, 'other', 'SKILL.md')))
  check('  用户自己的文件夹还在', existsSync(join(MINE, 'SKILL.md')))

  // --- click it again -------------------------------------------------------
  const again = I.uninstallAll('a/b::probe')
  check('再点一次：返回 0，不报错', again.removed === 0 && again.refused.length === 0, JSON.stringify(again))
  check('  也没删掉别的东西', existsSync(join(A, 'other', 'SKILL.md')) && existsSync(join(MINE, 'SKILL.md')))

  // --- reinstall after uninstall --------------------------------------------
  const after = await I.installFromGithub({ skills: [withSrc(skill, src)], destinations: [A] })
  check('卸载后可以重新安装', after.ok.length === 1, JSON.stringify(after.errors.map(e => e.reason)))
  check('  文件真的回来了', existsSync(join(A, 'probe', 'SKILL.md')))
  check('  而且有新的记录', recordsFor('a/b::probe').length === 1)

  // --- the skill stays in the library, so it can be installed again ---------
  // Seeded rather than fetched: this audit must not need the network to answer a
  // question about deletion.
  I.library.update((d) => {
    d.items = [{
      id: 'a/b',
      fullName: 'a/b',
      addedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ready',
      sourcePath: '',
      meta: { fullName: 'a/b', owner: 'a', name: 'b', stars: 1, topics: [] },
      skills: [{ id: 'a/b::probe', repoFullName: 'a/b', path: '', name: 'probe', title: 'probe', tags: [], source: 'github' }]
    }]
  })
  const libBefore = I.libraryItems().length
  const skillsBefore = I.libraryItems()[0].skills.length
  I.uninstallAll('a/b::probe')
  check('库里的条目还在', I.libraryItems().some((i) => i.id === 'a/b'), I.libraryItems().map((i) => i.id).join(', '))
  check('技能清单一字未动', I.libraryItems().length === libBefore && I.libraryItems()[0].skills.length === skillsBefore, libBefore + ' repos, ' + skillsBefore + ' skills')
  check(
    '所以还能重新装回来',
    (await I.installFromGithub({ skills: [withSrc(skill, src)], destinations: [A] })).ok.length === 1 &&
      existsSync(join(A, 'probe', 'SKILL.md'))
  )

  // --- the user replaced the installed folder with their own work -----------
  /*
    The case a shape check misses.

    The first guard asked "does this look like a skill" — a top-level SKILL.md —
    which is exactly what the user's own folder also has. So: install, then
    replace the folder's contents with something the user wrote, then uninstall.
    Ownership is the question that can be answered, and the marker answers it.
  */
  await I.installFromGithub({ skills: [withSrc(skill, src)], destinations: [A] })
  const swapped = join(A, 'probe')
  fs.rmSync(swapped, { recursive: true, force: true })
  fs.mkdirSync(swapped, { recursive: true })
  fs.writeFileSync(join(swapped, 'SKILL.md'), '---\\nname: mine\\ndescription: my own work\\n---\\n\\n# mine\\n')
  const swap = I.uninstallAll('a/b::probe')
  check('用户用自己的内容顶掉了那个文件夹时：拒绝删除', swap.removed === 0 && swap.refused.length === 1, JSON.stringify(swap))
  check('  而且理由带上了路径', swap.refused[0] === swapped, swap.refused[0])
  check('  用户的东西一个字没动', fs.readFileSync(join(swapped, 'SKILL.md'), 'utf8').includes('# mine'))

  // a folder carrying a *different* SkillHub skill's marker is not ours either
  fs.rmSync(swapped, { recursive: true, force: true })
  fs.mkdirSync(swapped, { recursive: true })
  fs.writeFileSync(join(swapped, 'SKILL.md'), '---\\nname: someone-else\\ndescription: x\\n---\\n')
  fs.writeFileSync(join(swapped, '.skillhub-install.json'), JSON.stringify({ skillId: 'z/z::someone-else', repoFullName: 'z/z' }))
  const other2 = I.uninstallAll('a/b::probe')
  check('文件夹上是别的技能的标记时：也拒绝', other2.removed === 0 && other2.refused.length === 1, JSON.stringify(other2))
  check('  那个文件夹还在', existsSync(join(swapped, 'SKILL.md')))

  // and ours is still removable, so the guard is not simply refusing everything
  fs.rmSync(swapped, { recursive: true, force: true })
  await I.installFromGithub({ skills: [withSrc(skill, src)], destinations: [A] })
  const legit = I.uninstallAll('a/b::probe')
  check('真正属于我们的副本仍然能删', legit.removed === 1 && legit.refused.length === 0 && !existsSync(join(A, 'probe')), JSON.stringify(legit))

  // --- the guard: a record must not be able to point at a directory ---------
  const A_ABS = A
  const malicious = I.installRecords().length
  I.installs.update((d) => {
    d.records = d.records.filter((r) => r.skillId !== 'a/b::evil')
    d.records.push({ id: 'a/b::evil@' + A_ABS, skillId: 'a/b::evil', skillName: 'evil', repoFullName: 'a/b',
      agentId: 'custom:evil', agentName: 'Evil', targetDir: home, linkPath: A_ABS, mode: 'copy',
      installedAt: Date.now(), sourcePath: A_ABS })
  })
  const guarded = I.uninstallFrom('a/b::evil', 'custom:evil')
  check('拒绝删除「智能体技能目录本身」', !guarded.ok, JSON.stringify(guarded))
  // The probe skill was legitimately removed by the section above; what must
  // survive is the destination itself and everything never targeted in it.
  check('  那个目录和里面的别的技能都还在', existsSync(A) && existsSync(join(A, 'other', 'SKILL.md')))

  I.installs.update((d) => {
    d.records = d.records.filter((r) => r.skillId !== 'a/b::evil2')
    d.records.push({ id: 'a/b::evil2@' + home, skillId: 'a/b::evil2', skillName: 'evil2', repoFullName: 'a/b',
      agentId: 'custom:evil2', agentName: 'Evil', targetDir: home, linkPath: home, mode: 'copy',
      installedAt: Date.now(), sourcePath: home })
  })
  const guarded2 = I.uninstallFrom('a/b::evil2', 'custom:evil2')
  check('拒绝删除「包含智能体目录的上级目录」', !guarded2.ok, JSON.stringify(guarded2))
  check('  一切都还在', existsSync(join(A, 'other', 'SKILL.md')) && existsSync(MINE) && existsSync(join(MINE, 'SKILL.md')))

  console.log(JSON.stringify(results))
})().catch((err) => { console.log(JSON.stringify({ crash: String(err && err.stack || err) })) })
`,
  'utf8'
)

let out
try {
  out = execFileSync(process.execPath, [probe], {
    encoding: 'utf8',
    env: { ...process.env, SKILLHUB_HOME: home, HOME: home, USERPROFILE: home }
  })
} catch (err) {
  console.error('探针未能运行：', err.message)
  console.error(err.stdout || '')
  process.exit(1)
}

const parsed = JSON.parse(out.trim().split('\n').pop())
rmSync(home, { recursive: true, force: true })

if (parsed.crash) {
  console.error('探针崩溃：\n' + parsed.crash)
  process.exit(1)
}

let failed = 0
for (const r of parsed) {
  if (!r.ok) failed++
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
}
console.log(`\n${parsed.length - failed}/${parsed.length} 项通过`)
process.exit(failed ? 1 : 0)
