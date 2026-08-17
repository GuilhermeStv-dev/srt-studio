export type PresetSettings = {
  model: string
  language: string
  targetWords: number
  ignorePrepositions: boolean
  preserveCommasPeriods: boolean
  formatMonetaryThousands: boolean
}

export type Preset = PresetSettings & {
  id: string
  name: string
  builtIn: boolean
}

const STORAGE_KEY = 'srt-studio.presets.v1'

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'builtin:espy-dynamic',
    name: 'ES-PY · Dinâmico',
    builtIn: true,
    model: 'large-v3',
    language: 'es',
    targetWords: 1,
    ignorePrepositions: true,
    preserveCommasPeriods: true,
    formatMonetaryThousands: false
  },
  {
    id: 'builtin:espy-balanced',
    name: 'ES-PY · Equilibrado',
    builtIn: true,
    model: 'large-v3',
    language: 'es',
    targetWords: 2,
    ignorePrepositions: true,
    preserveCommasPeriods: true,
    formatMonetaryThousands: false
  }
]

function isPreset(value: unknown): value is Preset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Record<string, unknown>
  return (
    typeof preset.id === 'string' &&
    preset.id.startsWith('custom:') &&
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    preset.builtIn === false &&
    typeof preset.model === 'string' &&
    typeof preset.language === 'string' &&
    typeof preset.targetWords === 'number' &&
    [1, 2, 3, 4].includes(preset.targetWords) &&
    typeof preset.ignorePrepositions === 'boolean' &&
    typeof preset.preserveCommasPeriods === 'boolean' &&
    typeof preset.formatMonetaryThousands === 'boolean'
  )
}

export function loadCustomPresets(): Preset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPreset) : []
  } catch {
    return []
  }
}

export function persistCustomPresets(presets: Preset[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(presets.filter((preset) => !preset.builtIn))
  )
}

export function createCustomPreset(name: string, settings: PresetSettings): Preset {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return {
    id: `custom:${suffix}`,
    name: name.trim(),
    builtIn: false,
    ...settings
  }
}

export function samePresetSettings(
  preset: PresetSettings,
  settings: PresetSettings
): boolean {
  return (
    preset.model === settings.model &&
    preset.language === settings.language &&
    preset.targetWords === settings.targetWords &&
    preset.ignorePrepositions === settings.ignorePrepositions &&
    preset.preserveCommasPeriods === settings.preserveCommasPeriods &&
    preset.formatMonetaryThousands === settings.formatMonetaryThousands
  )
}
