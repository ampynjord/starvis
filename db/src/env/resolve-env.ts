/**
 * Normalise an env string to the two canonical values used in the `env` column.
 * Anything that isn't explicitly "ptu" is treated as "live".
 */
export function resolveEnv(env: string | undefined): 'live' | 'ptu' {
  return env === 'ptu' ? 'ptu' : 'live';
}
