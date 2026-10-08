import type { WebRuntime } from "#lib/server/runtime.ts";
import type { AuthGuard } from "#lib/server/auth-guard.ts";
import type { Observability } from "#lib/server/observability.ts";

declare global {
  namespace App {
    interface Locals {
      run: WebRuntime.Run;
      auth: AuthGuard.RequestAuth;
      reportError?: Observability.Reporter;
    }
  }
}

export {};
