import { useEffect, useState } from 'react'

/** Escolha de aspeto, guardada só neste dispositivo. "auto" segue o sistema. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

const KEY = 'theme' // a mesma chave que o script de __root.tsx lê antes do primeiro desenho
const dark = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

function apply(choice: ThemeChoice) {
  const isDark = choice === 'dark' || (choice === 'auto' && dark().matches)
  const h = document.documentElement
  h.classList.toggle('dark', isDark)
  h.classList.toggle('light', !isDark)
  h.style.colorScheme = isDark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0d1130' : '#eef1ff')
}

/** Em Automático, acompanha a mudança do sistema (ex.: modo escuro ao anoitecer). Chamar uma vez. */
export function watchSystemTheme() {
  dark().addEventListener('change', () => {
    if (read() === 'auto') apply('auto')
  })
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read)

  useEffect(() => apply(choice), [choice])

  const set = (c: ThemeChoice) => {
    try {
      if (c === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, c)
    } catch {
      /* sem armazenamento: o tema aplica-se só até fechar a app */
    }
    setChoice(c)
  }
  return [choice, set] as const
}
