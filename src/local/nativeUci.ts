/**
 * Thin bridge to Android JavascriptInterface `SherlockUci`.
 * Native side owns ProcessBuilder stdin/stdout for liblughnasadh.so.
 */

export interface SherlockUciNative {
  /** Start (or restart) the UCI process; returns JSON {ok:boolean, error?:string, path?:string} */
  start(): string;
  /** Write one UCI line (without trailing newline) */
  send(line: string): void;
  /** Stop search / soft stop — sends `stop` if process alive */
  stop(): void;
  /** Quit and destroy process */
  quit(): void;
  /** true if native bridge present */
  isAvailable(): boolean;
}

declare global {
  interface Window {
    SherlockUci?: SherlockUciNative;
    /** Called from Java on each stdout line */
    __sherlockOnUciLine?: (line: string) => void;
    __sherlockOnUciExit?: (code: number) => void;
    __sherlockOnUciError?: (message: string) => void;
  }
}

export function hasNativeUci(): boolean {
  return typeof window !== 'undefined' && !!window.SherlockUci;
}

export type NativeLineHandler = (line: string) => void;
export type NativeExitHandler = (code: number) => void;
export type NativeErrorHandler = (message: string) => void;

export class NativeUciPort {
  private onLine: NativeLineHandler | null = null;
  private onExit: NativeExitHandler | null = null;
  private onError: NativeErrorHandler | null = null;

  attach(handlers: {
    onLine: NativeLineHandler;
    onExit: NativeExitHandler;
    onError: NativeErrorHandler;
  }): void {
    this.onLine = handlers.onLine;
    this.onExit = handlers.onExit;
    this.onError = handlers.onError;
    window.__sherlockOnUciLine = (line) => this.onLine?.(line);
    window.__sherlockOnUciExit = (code) => this.onExit?.(code);
    window.__sherlockOnUciError = (message) => this.onError?.(message);
  }

  start(): { ok: boolean; error?: string; path?: string } {
    if (!window.SherlockUci) return { ok: false, error: 'SherlockUci bridge missing' };
    try {
      const raw = window.SherlockUci.start();
      return JSON.parse(raw) as { ok: boolean; error?: string; path?: string };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  send(line: string): void {
    window.SherlockUci?.send(line);
  }

  stop(): void {
    window.SherlockUci?.stop();
  }

  quit(): void {
    window.SherlockUci?.quit();
  }
}
