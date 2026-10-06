import type { WebRuntime } from "#lib/server/runtime.ts";
import type { AuthProvider } from "#lib/server/auth-provider.ts";

declare global {
  namespace App {
    interface Locals {
      run: WebRuntime.Run;
      authenticate: AuthProvider.IdentityLookup<AuthProvider.Service>;
    }
  }
}

export {};
