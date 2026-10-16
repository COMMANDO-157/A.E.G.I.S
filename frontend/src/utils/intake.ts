export type IntakeState = 'loading' | 'enabled' | 'disabled' | 'unknown' | 'unavailable';
export function intakeState(config: unknown): IntakeState {
  if (!config || typeof config !== 'object' || !('intakeEnabled' in config) || typeof config.intakeEnabled !== 'boolean') return 'unknown';
  return config.intakeEnabled ? 'enabled' : 'disabled';
}
