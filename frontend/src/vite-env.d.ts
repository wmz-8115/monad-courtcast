/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPLAY_VIDEO_URL?: string;
  readonly VITE_MUSDC_ADDRESS?: string;
  readonly VITE_MARKET_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
