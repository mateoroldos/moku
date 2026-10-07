import { Email } from "@moku/core/email";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

const SendResponse = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.Struct({
    delivered: Schema.Array(Schema.String),
    queued: Schema.Array(Schema.String),
    permanent_bounces: Schema.Array(Schema.String),
  }),
});

export const layer = Layer.effect(
  Email.Service,
  Effect.gen(function* () {
    const accountId = yield* Config.schema(Schema.NonEmptyString, "CLOUDFLARE_ACCOUNT_ID");
    const token = yield* Config.redacted("CLOUDFLARE_API_TOKEN");
    const from = yield* Config.schema(Schema.NonEmptyString, "EMAIL_FROM");
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;

    const send = Effect.fn("EmailCloudflare.send")(
      function* (message: Email.Message) {
        const response = yield* HttpClientRequest.post(url).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe({
            from,
            to: message.to,
            subject: message.subject,
            text: Redacted.value(message.text),
          }),
          client.execute,
          // Raw transport causes can contain credentials; trace only the redacted send failure.
          Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(SendResponse)),
        );

        const { delivered, queued, permanent_bounces } = response.result;
        if (
          permanent_bounces.includes(message.to) ||
          !(delivered.includes(message.to) || queued.includes(message.to))
        ) {
          return yield* Effect.fail(response);
        }
      },
      Effect.mapError((cause) => new Email.Unavailable({ cause: Redacted.make(cause) })),
    );

    return Email.Service.of({ send });
  }),
);

export * as EmailCloudflare from "./email-cloudflare.ts";
