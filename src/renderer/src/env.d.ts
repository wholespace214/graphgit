/// <reference types="vite/client" />

import type { GraphGitApi } from '@shared/api'

declare global {
  interface Window {
    graphgit: GraphGitApi
  }
}

export {}
