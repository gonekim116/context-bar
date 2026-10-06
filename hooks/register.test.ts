import { expect, test } from 'claude-code/testing'
import type { ContextCategoryKind, SessionUsage } from 'claude-code'

const cat = (name: string, tokens: number, color: string, kind: ContextCategoryKind) => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 1000,
    tokens: 300,
    percent: 30,
    breakdown: {
      categories: [
        cat('System prompt', 100, 'promptBorder', 'used'),
        cat('Messages', 200, 'claude', 'used'),
        cat('MCP tools', 50, 'inactive', 'deferred'),
        cat('Free space', 600, 'subtle', 'free'),
        cat('Autocompact buffer', 100, 'warning', 'buffer'),
      ],
      totalTokens: 300,
      maxTokens: 1000,
      rawMaxTokens: 1000,
      autocompactSource: 'auto',
      percentage: 30,
      gridRows: [],
      model: 'test',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      autoCompactThreshold: 900,
      apiUsage: null,
    },
  },
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 54, // 50 cells inside the border
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('bar splits the window by category, marks auto-compact; /context-bar toggles', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'compact', args: '' }) // any command refreshes the bar

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
    type Run = { props: { color: string; backgroundColor?: string }; children: string[] }
    const runs = (await ui.find({ key: 'bar' }))?.children as Run[]
    // system 5, messages 10, free 30, compact marker at 900/1000 (cell 45), solid black after it
    expect(runs.map(r => r.children.join('').length)).toEqual([5, 10, 30, 1, 4])
    expect(runs[3].props).toEqual({ color: '#ffd700', backgroundColor: '#000000' })
    expect(runs[4].props.color).toBe('#000000')
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('30') // the fill badge
    expect(drawn).toContain('system prompt')
    expect(drawn).not.toContain('mcp tools') // deferred schemas sit outside the window
    await ui.unmount()
  }

  expect((await $.command.run({ command: 'context-bar', args: '' })).text).toBe('Context bar off.')
  expect((await $.command.run({ command: 'context-bar', args: '' })).text).toBe('Context bar on.')
})
