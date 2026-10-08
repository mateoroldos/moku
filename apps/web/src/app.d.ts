import type { WebRuntime } from "#lib/server/runtime.ts";
import type { AuthGuard } from "#lib/server/auth-guard.ts";

declare global {
  namespace App {
    interface Locals {
      run: WebRuntime.Run;
      auth: AuthGuard.Request;
    }
  }
}

export {};
