declare module '@9am/fire-flame-react' {
  import type { ComponentType } from 'react'

  export type FireFlameOption = Record<string, unknown>
  export const FireFlame: ComponentType<{ option?: FireFlameOption }>
}
