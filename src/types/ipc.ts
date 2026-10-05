/**
 * The typed contract for the Electron preload bridge, plus the ambient
 * declarations the renderer needs for the browser File System Access API.
 *
 * This lives in an imported module (not a bare .d.ts) so it is guaranteed to be
 * part of the compilation, and so `getBridge()` is reachable from one place.
 */

export interface BridgeDocument {
  /** Absolute path in Electron. Empty string in the browser. */
  path: string;
  name: string;
  content: string;
  size: number;
  lastModified: number;
}

export interface BridgeSaveResult {
  ok: true;
  path: string;
  bytes: number;
}

export interface BridgeStatResult {
  exists: boolean;
  size?: number;
  mtimeMs?: number;
}

export interface VeloxBridge {
  readonly isElectron: true;
  readonly platform: string;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    isMaximized(): Promise<boolean>;
    close(): Promise<void>;
    setTitleBarOverlay(options: { color: string; symbolColor: string; height: number }): Promise<boolean>;
    onMaximizeChange(callback: (maximized: boolean) => void): () => void;
  };
  fs: {
    open(): Promise<BridgeDocument | null>;
    openPath(filePath: string): Promise<BridgeDocument>;
    save(filePath: string, content: string): Promise<BridgeSaveResult>;
    saveAs(content: string, suggestedName: string): Promise<BridgeDocument | null>;
    read(filePath: string): Promise<string>;
    stat(filePath: string): Promise<BridgeStatResult>;
  };
  pathForFile(file: File): string;
}

/**
 * Minimal File System Access API surface. Declared rather than cast to `any` so
 * the picker option objects are actually type-checked — they never were before,
 * which is how the fabricated-path bug survived a clean `tsc --noEmit`.
 */
export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}
export interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
}
export interface SaveFilePickerOptions {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
}

declare global {
  interface Window {
    readonly velox?: VeloxBridge;
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }
}

/** The preload bridge, or null when running as a plain web page. */
export function getBridge(): VeloxBridge | null {
  if (typeof window === 'undefined') return null;
  return window.velox ?? null;
}

export function isElectronRuntime(): boolean {
  return getBridge() !== null;
}
