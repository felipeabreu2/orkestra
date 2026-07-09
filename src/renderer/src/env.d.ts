/// <reference types="vite/client" />
import type { OrkestraApi } from '../../preload'

declare global {
  interface Window {
    orkestra: OrkestraApi
  }
}
