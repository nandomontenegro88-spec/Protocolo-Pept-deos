import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/** Carrega dados e devolve `reload`. `fn` deve ser estável (useCallback). */
export function useLoad<T>(fn: () => PromiseLike<T>, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setData(await fn())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [fn])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload }
}

/** Lança o erro do Supabase, se existir, e devolve os dados. */
export function unwrap<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

const urlCache = new Map<string, { url: string; exp: number }>()

/** URL assinado (1h) para um ficheiro do bucket privado. */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data } = await supabase.storage.from('private').createSignedUrl(path, 3600)
  if (!data) return null
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 })
  return data.signedUrl
}

export function useSignedUrl(path: string | null | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (path && enabled) void signedUrl(path).then((u) => alive && setUrl(u))
    else setUrl(null)
    return () => {
      alive = false
    }
  }, [path, enabled])
  return url
}

export async function uploadPrivate(coupleId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${coupleId}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from('private').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

/** True quando o elemento se aproxima do ecrã (carregamento diferido). */
export function useNearViewport<T extends Element>(margin = '300px') {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margin, near])
  return [ref, near] as const
}
