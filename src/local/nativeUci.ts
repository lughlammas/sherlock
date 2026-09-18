/**
 * Thin bridge to Android JavascriptInterface `SherlockUci`.
 * Supports multiple concurrent engine ids (main / white / black).
 */

export interface SherlockUciNative {
  start(engineId?: string): string;
  startEngine?(engineId: string): string;
  send(engineIdOrLine: string, lineMaybe?: string): void;
  sendLine?(engineId: string, line: string): void;
  stop(engineId?: string): void;
  stopEngine?(engineId: string): void;
  quit(engineId?: string): void;
  quitEngine?(engineId: string): void;
  isAvailable(): boolean;
}

declare global {
  interface Window {
    SherlockUci?: SherlockUciNative;
    __sherlockOnUciLine?: (a: string, b?: string) => void;
    __sherlockOnUciExit?: (a: string | number, b?: number) => void;
    __sherlockOnUciError?: (a: string, b?: string) => void;
  }
}

export function hasNativeUci(): boolean {
  return typeof window !== 'undefined' && !!window.SherlockUci;
}

export type NativeLineHandler = (line: string) => void;
export type NativeExitHandler = (code: number) => void;
export type NativeErrorHandler = (message: string) => void;

type SlotHandlers = {
  onLine: NativeLineHandler;
  onExit: NativeExitHandler;
  onError: NativeErrorHandler;
};

const slots = new Map<string, SlotHandlers>();
let dispatcherInstalled = false;

function installGlobalDispatcher(): void {
  if (dispatcherInstalled || typeof window === 'undefined') return;
  dispatcherInstalled = true;

  window.__sherlockOnUciLine = (a: string, b?: string) => {
    if (typeof b === 'string') slots.get(a)?.onLine(b);
    else slots.get('main')?.onLine(a);
  };
  window.__sherlockOnUciExit = (a: string | number, b?: number) => {
    if (typeof a === 'string' && typeof b === 'number') slots.get(a)?.onExit(b);
    else if (typeof a === 'number') slots.get('main')?.onExit(a);
  };
  window.__sherlockOnUciError = (a: string, b?: string) => {
    if (typeof b === 'string') slots.get(a)?.onError(b);
    else slots.get('main')?.onError(a);
  };
}

export class NativeUciPort {
  private engineId: string;

  constructor(engineId = 'main') {
    this.engineId = engineId;
    installGlobalDispatcher();
  }

  attach(handlers: SlotHandlers): void {
    slots.set(this.engineId, handlers);
  }

  detach(): void {
    slots.delete(this.engineId);
  }

  start(): { ok: boolean; error?: string; path?: string } {
    if (!window.SherlockUci) return { ok: false, error: 'SherlockUci bridge missing' };
    try {
      const api = window.SherlockUci;
      const raw =
        this.engineId !== 'main' && api.startEngine
          ? api.startEngine(this.engineId)
          : api.start(this.engineId);
      return JSON.parse(raw) as { ok: boolean; error?: string; path?: string };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  send(line: string): void {
    const api = window.SherlockUci;
    if (!api) return;
    if (api.sendLine) {
      api.sendLine(this.engineId, line);
      return;
    }
    if (this.engineId === 'main') api.send(line);
    else api.send(this.engineId, line);
  }

  stop(): void {
    const api = window.SherlockUci;
    if (!api) return;
    if (api.stopEngine) api.stopEngine(this.engineId);
    else if (this.engineId === 'main') api.stop();
    else api.stop(this.engineId);
  }

  quit(): void {
    const api = window.SherlockUci;
    if (!api) return;
    if (api.quitEngine) api.quitEngine(this.engineId);
    else if (this.engineId === 'main') api.quit();
    else api.quit(this.engineId);
  }
}
