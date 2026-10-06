export type Seg = { name: string; tokens: number; color: string }
export type Bar = { segs: Seg[]; used: number; window: number; compactAt: number | null }

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { bar: Bar | null; isOn: boolean }
  }
}
