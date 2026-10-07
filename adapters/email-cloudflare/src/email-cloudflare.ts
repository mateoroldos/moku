import { Email } from "@moku/core/email";
import { Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

const SendResponse = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    result: Schema.Struct({
      delivered: Schema.Array(Schema.String),
      queued: Schema.Array(Schema.String),
    }),
  }),
  Schema.Struct({ success: Schema.Literal(false), errors: Schema.Array(Schema.Unknown) }),
]);

export interface Options {
  readonly accountId: string;
  readonly token: Redacted.Redacted<string>;
  readonly from: string;
}

const unavailable = Effect.fnUntraced(function* (
  reason: "request" | "http" | "response" | "provider" | "not-accepted",
  cause: unknown,
  status?: number,
) {
  const annotations = status === undefined ? { reason } : { reason, "http.status": status };

  yield* Effect.logError("email.cloudflare.failed").pipe(Effect.annotateLogs(annotations));

  return yield* new Email.Unavailable({ cause: Redacted.make(cause) });
});

export const layer = ({ accountId, token, from }: Options) =>
  Layer.effect(
    Email.Service,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;

      const send = Effect.fn("EmailCloudflare.send")(function* (message: Email.Message) {
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
          Effect.catch((cause) =>
            unavailable(
              cause.reason._tag === "StatusCodeError" ? "http" : "request",
              cause,
              cause.response?.status,
            ),
          ),
        );

        const body = yield* HttpClientResponse.schemaBodyJson(SendResponse)(response).pipe(
          Effect.catch((cause) => unavailable("response", cause, response.status)),
        );
        if (!body.success) {
          return yield* unavailable("provider", body, response.status);
        }

        const { delivered, queued } = body.result;
        if (!(delivered.includes(message.to) || queued.includes(message.to))) {
          return yield* unavailable("not-accepted", body, response.status);
        }
      });

      return Email.Service.of({ send });
    }),
  );

export * as EmailCloudflare from "./email-cloudflare.ts";
