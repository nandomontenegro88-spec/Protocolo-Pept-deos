/** Vibração curta, no mesmo instante da ação (só onde o navegador suporta). */
export function tick(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* sem suporte */
  }
}
