import type { WebRuntime } from "#lib/server/runtime.ts";
import type { AuthProvider } from "#lib/server/auth-provider.ts";
import type { Organization } from "@moku/domain/organization";
import type { Schema } from "effect";

declare global {
  namespace App {
    interface PageState {
      // Destination load errors unmount the form; carry its confirmed result to the error boundary.
      // Presentation only: navigation state never proves identity or membership.
      createdOrganization?: Schema.Codec.Encoded<typeof Organization>;
    }

    interface Locals {
      run: WebRuntime.Run;
      authenticate: AuthProvider.IdentityLookup<AuthProvider.Service>;
    }
  }
}

export {};
