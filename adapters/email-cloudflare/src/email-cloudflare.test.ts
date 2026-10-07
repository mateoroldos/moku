import { assert, it } from "@effect/vitest";
import { Email } from "@moku/core/email";
import { Cause, ConfigProvider, Effect, Exit, Layer, Redacted, Schema, Tracer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { EmailCloudflare } from "./email-cloudflare.ts";

const delivery = EmailCloudflare.layer.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: {
          CLOUDFLARE_ACCOUNT_ID: "test-account",
          CLOUDFLARE_API_TOKEN: "test-token",
          EMAIL_FROM: "Moku <hello@example.com>",
        },
      }),
    ),
  ),
);
const message: Email.Message = {
  to: "reviewer@example.com",
  subject: "Verify your Moku email",
  text: Redacted.make("https://moku.test/verify?token=private-link"),
};

it.effect.each(["delivered", "queued"] as const)(
  "sends the email and accepts a recipient reported as %s",
  (status) =>
    Effect.gen(function* () {
      const email = yield* Email.Service;
      yield* email.send(message);
    }).pipe(
      Effect.provide(delivery),
      Effect.provideService(FetchHttpClient.Fetch, (input, init) => {
        const request = new Request(input, init);
        assert.strictEqual(request.method, "POST");
        assert.strictEqual(
          request.url,
          "https://api.cloudflare.com/client/v4/accounts/test-account/email/sending/send",
        );
        assert.strictEqual(request.headers.get("authorization"), "Bearer test-token");
        assert.strictEqual(request.headers.get("content-type"), "application/json");
        return request.text().then((text) => {
          assert.deepStrictEqual(Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(text), {
            from: "Moku <hello@example.com>",
            to: "reviewer@example.com",
            subject: "Verify your Moku email",
            text: "https://moku.test/verify?token=private-link",
          });

          return Response.json({
            success: true,
            result: { delivered: [], queued: [], permanent_bounces: [], [status]: [message.to] },
          });
        });
      }),
    ),
);

it.effect.each([
  {
    name: "HTTP failure",
    response: () =>
      Response.json(
        {
          success: true,
          result: { delivered: [message.to], queued: [], permanent_bounces: [] },
        },
        { status: 503 },
      ),
  },
  {
    name: "provider failure",
    response: () =>
      Response.json({
        success: false,
        result: { delivered: [message.to], queued: [], permanent_bounces: [] },
      }),
  },
  { name: "malformed response", response: () => Response.json({ success: true, result: {} }) },
  { name: "invalid JSON", response: () => new Response("not json") },
  {
    name: "unreported recipient",
    response: () =>
      Response.json({
        success: true,
        result: { delivered: [], queued: [], permanent_bounces: [] },
      }),
  },
  {
    name: "different recipient",
    response: () =>
      Response.json({
        success: true,
        result: { delivered: ["other@example.com"], queued: [], permanent_bounces: [] },
      }),
  },
  {
    name: "permanent bounce",
    response: () =>
      Response.json({
        success: true,
        result: { delivered: [], queued: [], permanent_bounces: [message.to] },
      }),
  },
])("maps $name to Email.Unavailable without retrying", ({ response }) => {
  let requests = 0;

  return Effect.gen(function* () {
    const email = yield* Email.Service;
    const failure = yield* Effect.flip(email.send(message));

    assert.instanceOf(failure, Email.Unavailable);
    assert.strictEqual(requests, 1);
  }).pipe(
    Effect.provide(delivery),
    Effect.provideService(FetchHttpClient.Fetch, () => {
      requests++;
      return Promise.resolve(response());
    }),
  );
});

it.effect("redacts transport diagnostics in failures and traces without retrying", () => {
  let requests = 0;
  const spans: Array<Tracer.NativeSpan> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });

  return Effect.gen(function* () {
    const email = yield* Email.Service;
    const failure = yield* Effect.flip(email.send(message));

    assert.instanceOf(failure, Email.Unavailable);
    assert.strictEqual(requests, 1);
    assert.notInclude(String(failure), "private-link");
    assert.notInclude(String(failure), "test-token");

    assert.include(
      spans.map((span) => span.name),
      "EmailCloudflare.send",
    );
    const diagnostics = spans
      .flatMap((span) => {
        assert(span.status._tag === "Ended");
        return Exit.match(span.status.exit, {
          onSuccess: () => [],
          onFailure: (cause) =>
            Cause.prettyErrors(cause, { includeCauseInStack: true }).map(
              (error) => error.stack ?? error.message,
            ),
        });
      })
      .join("\n");
    assert.include(diagnostics, "Email.Unavailable");
    assert.notInclude(diagnostics, "private-link");
    assert.notInclude(diagnostics, "test-token");
  }).pipe(
    Effect.provide(delivery),
    Effect.withTracer(tracer),
    Effect.withTracerEnabled(true),
    Effect.provideService(FetchHttpClient.Fetch, () => {
      requests++;
      return Promise.reject(new Error("private-link test-token"));
    }),
  );
});
