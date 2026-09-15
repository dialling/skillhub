/**
 * Skill-directory hygiene, shared by everything that counts skills.
 *
 * A raw crawl of "every directory containing a SKILL.md" over-counts badly,
 * because large repos ship the same skills several times and sometimes ship
 * scaffolding that merely looks like a skill:
 *
 *   sickn33/agentic-awesome-skills  6670 → the same 2,119 skills packaged once
 *                                   per agent under plugins/<agent>/skills
 *   gotalab/cc-sdd                   137 → 136 are scaffolds under templates/;
 *                                   the repo really has one skill
 *   alirezarezvani/claude-skills     846 → .gemini/skills is a deploy copy
 *
 * The batch equivalent lives in scripts/dedupe-catalog-skills.mjs. Keep the two
 * in step: this module is what the running app uses.
 */

const JUNK = /^(readme|readme\.md|template|templates?|example|examples?|sample|samples?|docs?|test|tests?|_\w+|\.\w+)$/i

export interface CleanResult {
  dirs: string[]
  raw: number
  droppedScaffolds: number
  droppedDuplicates: number
}

/** Higher is more canonical — used to pick one path per skill folder name. */
function canonicalScore(path: string): number {
  const segs = path ? path.split('/') : []
  let score = 0
  if (segs[0] === 'skills') score += 100
  if (segs[0] && !segs[0].startsWith('.') && segs.length === 2) score += 50
  if (segs.some((s) => s.startsWith('.'))) score -= 30
  if (segs.includes('plugins')) score -= 40
  if (segs.includes('dist') || segs.includes('build') || segs.includes('node_modules')) score -= 60
  score -= segs.length * 10
  score -= path.length / 200
  return score
}

export function cleanSkillDirs(input: string[]): CleanResult {
  const best = new Map<string, { path: string; score: number }>()
  let droppedScaffolds = 0
  for (const path of input) {
    const segs = (path ? path.split('/') : []).map((s) => s.toLowerCase())
    const name = segs[segs.length - 1] || ''
    if (segs.includes('templates') || segs.includes('template') || segs.includes('fixtures')) {
      droppedScaffolds++
      continue
    }
    if (JUNK.test(name)) {
      droppedScaffolds++
      continue
    }
    const score = canonicalScore(path)
    const prev = best.get(name)
    if (!prev || score > prev.score) best.set(name, { path, score })
  }
  const dirs = [...best.values()].map((v) => v.path).sort()
  return {
    dirs,
    raw: input.length,
    droppedScaffolds,
    droppedDuplicates: input.length - droppedScaffolds - dirs.length
  }
}
