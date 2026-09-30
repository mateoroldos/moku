import { Config, Effect, type Redacted, Schema } from "effect";

export interface Settings {
  readonly origin: URL;
  readonly secret: Redacted.Redacted<string>;
}

const Origin = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    !url.href.includes("?") &&
    !url.href.includes("#")
      ? undefined
      : "Expected an HTTPS origin (HTTP is allowed for loopback development)",
  ),
);

export class Invalid extends Schema.TaggedError<Invalid>()("AuthConfig.Invalid", {
  setting: Schema.Literals(["AUTH_ORIGIN", "AUTH_SECRET"]),
}) {}

export const load = Effect.gen(function* () {
  const input = yield* Config.string("AUTH_ORIGIN");
  const origin = yield* Schema.decodeEffect(Origin)(input).pipe(
    Effect.mapError(() => new Invalid({ setting: "AUTH_ORIGIN" })),
  );
  const secret = yield* Config.redacted("AUTH_SECRET").pipe(
    Effect.flatMap(
      Schema.decodeEffect(Schema.Redacted(Schema.String.check(Schema.isMinLength(32)))),
    ),
    Effect.catchTag("SchemaError", () => new Invalid({ setting: "AUTH_SECRET" })),
  );
  return { origin, secret } satisfies Settings;
});

export * as AuthConfig from "./auth-config.ts";
