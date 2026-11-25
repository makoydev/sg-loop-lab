import { useMemo, useSyncExternalStore } from 'react'

/*
 * A tiny hash router. Hash routing means the built site works from any static
 * host or sub-path with zero server configuration.
 *
 *   #/                      → []
 *   #/patterns              → ['patterns']
 *   #/patterns/top-k        → ['patterns', 'top-k']
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  return raw.startsWith('/') ? raw : '/'
}

/** Current route as path segments. */
export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, currentPath, () => '/')
  return useMemo(() => path.split('/').filter(Boolean), [path])
}

/** `href` value for an in-app link. */
export function to(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`
}

export function navigate(path: string): void {
  window.location.hash = to(path)
}
