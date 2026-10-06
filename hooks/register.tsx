import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bar, Seg } from '../types'

const bar = atom({ plugin: 'context-bar', key: 'bar' } as const, null)
const isOn = atom({ plugin: 'context-bar', key: 'isOn' } as const, true)

const FREE = 'subtle'
const MARK = '#ffd700' // auto-compact point, yellow
const PAST = '#000000' // bar past the auto-compact point, solid black

const fmt = (t: number) =>
  t >= 1e6 ? `${+(t / 1e6).toFixed(1)}M`
  : t >= 1e4 ? `${Math.round(t / 1e3)}k`
  : t >= 1e3 ? `${+(t / 1e3).toFixed(1)}k`
  : `${t}`

const pct = (t: number, of: number) => {
  const p = (t / of) * 100
  return p >= 1 ? `${Math.round(p)}%` : `${+p.toFixed(1)}%`
}

// /context's labels, shortened: "System tools" -> "tools", "Custom agents" -> "agents".
const label = (name: string) => name.toLowerCase().replace(/^(system|custom) (?!prompt)/, '')

// One colored run per category, free space after, the auto-compact point as a marker.
// Every non-empty category gets at least one cell; over the width, the biggest gives way.
function runs(b: Bar, width: number) {
  const n = b.segs.map(s => Math.max(1, Math.round((s.tokens / b.window) * width)))
  const over = n.reduce((a, x) => a + x, 0) - width
  if (over > 0) {
    const big = n.indexOf(Math.max(...n))
    n[big] = Math.max(0, n[big] - over)
  }
  type Cell = { ch: string; color: string; bg?: string }
  const cells: Cell[] = []
  b.segs.forEach((s, i) => cells.push(...Array.from({ length: n[i] }, () => ({ ch: '█', color: s.color }))))
  while (cells.length < width) cells.push({ ch: '█', color: FREE })
  if (b.compactAt !== null) {
    const m = Math.min(width - 1, Math.round((b.compactAt / b.window) * width))
    cells[m] = { ch: '▏', color: MARK, bg: PAST }
    for (let i = m + 1; i < width; i++) cells[i] = { ch: '█', color: PAST }
  }
  const out: (Cell & { text: string })[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.color === c.color && last.bg === c.bg) last.text += c.ch
    else out.push({ ...c, text: c.ch })
  }
  return out
}

// 'summary' = local estimate, no token-count API calls (the 'full' count /context runs costs requests).
async function refresh($: EngineInterface) {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    if (!b) return
    const segs: Seg[] = b.categories
      .filter(c => c.kind === 'used' && c.tokens > 0)
      .map(c => ({ name: label(c.name), tokens: c.tokens, color: c.color }))
    const next: Bar = {
      segs,
      used: segs.reduce((a, s) => a + s.tokens, 0),
      window: context.window || b.rawMaxTokens,
      compactAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
    }
    await update($, bar, () => next)
  } catch {
    // no session bound yet: keep the last bar
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Toggle the context window bar above the prompt',
    })
    const r = await next(e)
    await refresh($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    return r
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== 'context-bar') {
      const r = await next(e)
      await refresh($) // /compact, /clear, /model change the window
      return r
    }
    await update($, isOn, v => !v)
    const shown = await read($, isOn)
    if (shown) await refresh($)
    return { text: shown ? 'Context bar on.' : 'Context bar off.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, bar)
    if (e.props.hasSurvey || b === null || !(await read($, isOn))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns - 4) // round border + 1 padding each side
    const fill = Math.round((b.used / b.window) * 100)
    const badge = fill < 50 ? 'success' : fill < 80 ? 'warning' : 'error'

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">◆</Text> <Text bold>context</Text>
          </Text>
          <Text>
            {fmt(b.used)} of {fmt(b.window)}
            {b.compactAt !== null && <Text dimColor> · compacts at {fmt(b.compactAt)}</Text>}{' '}
            <Text backgroundColor={badge} color="inverseText" bold>
              {' '}
              {fill}%{' '}
            </Text>
          </Text>
        </Box>
        <Box key="bar">
          {runs(b, width).map(r => (
            <Text color={r.color} backgroundColor={r.bg}>
              {r.text}
            </Text>
          ))}
        </Box>
        <Box flexWrap="wrap" columnGap={2}>
          {b.segs.map(s => (
            <Text>
              <Text color={s.color}>■</Text> {s.name} <Text bold>{fmt(s.tokens)}</Text>{' '}
              <Text dimColor>{pct(s.tokens, b.window)}</Text>
            </Text>
          ))}
          <Text>
            <Text color={FREE}>■</Text> free <Text bold>{fmt(Math.max(0, b.window - b.used))}</Text>
          </Text>
        </Box>
      </Box>
    )
  })
}
