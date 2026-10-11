/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPLAY_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
