import type { WebRuntime } from "#lib/server/runtime.ts";
import type { Authentication } from "#lib/server/authentication.ts";

declare global {
  namespace App {
    interface Locals {
      run: WebRuntime.Run;
      user: Authentication.User | null;
    }
  }
}

export {};
