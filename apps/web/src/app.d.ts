import type { WebRuntime } from "#lib/server/runtime.ts";

declare global {
  namespace App {
    interface Locals {
      run: WebRuntime.Run;
    }
  }
}

export {};
