import type { WebRuntime } from "#lib/server/runtime.ts";
import type { Authentication } from "#lib/server/authentication.ts";
import type { Organization } from "@moku/domain/organization";
import type { Schema } from "effect";

declare global {
  namespace App {
    interface PageState {
      createdOrganization?: Schema.Codec.Encoded<typeof Organization>;
    }

    interface Locals {
      run: WebRuntime.Run;
      authenticate: Authentication.IdentityLookup<Authentication.Service>;
    }
  }
}

export {};
