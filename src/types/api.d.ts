// Expose the update APIs to the renderer TypeScript environment
declare global {
  interface Window {
    api: {
      onUpdateAvailable?: (cb: (info: any) => void) => () => void;
      onUpdateDownloaded?: (cb: (info: any) => void) => () => void;
      onUpdateError?: (cb: (err: any) => void) => () => void;
      downloadUpdate?: () => Promise<{ ok: boolean; error?: string }>;
      installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
    } & Record<string, any>;
  }
}

export {};
