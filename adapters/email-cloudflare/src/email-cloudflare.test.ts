import { assert, it } from "@effect/vitest";
import { Email } from "@moku/core/email";
import { Cause, Effect, Exit, Layer, Logger, Redacted, Schema, Tracer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { EmailCloudflare } from "./email-cloudflare.ts";

const delivery = EmailCloudflare.layer({
  accountId: "test-account",
  token: Redacted.make("test-token"),
  from: "hello@example.com",
}).pipe(Layer.provide(FetchHttpClient.layer));
const message: Email.Message = {
  to: "reviewer@example.com",
  subject: "Verify your Moku email",
  text: Redacted.make("https://moku.test/verify?token=private-link"),
};

const captureLogs = () => {
  const entries: Array<ReturnType<typeof Logger.formatStructured.log>> = [];
  const json: Array<string> = [];
  const layer = Logger.layer([
    Logger.make((options) => {
      entries.push(Logger.formatStructured.log(options));
      json.push(Logger.formatJson.log(options));
    }),
  ]);

  return { entries, json, layer };
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
            from: "hello@example.com",
            to: "reviewer@example.com",
            subject: "Verify your Moku email",
            text: "https://moku.test/verify?token=private-link",
          });

          return Response.json({
            success: true,
            result: { delivered: [], queued: [], [status]: [message.to] },
          });
        });
      }),
    ),
);

it.effect.each([
  {
    name: "HTTP failure",
    reason: "http",
    status: 503,
    response: () =>
      Response.json(
        {
          success: true,
          result: { delivered: [message.to], queued: [] },
        },
        { status: 503 },
      ),
  },
  {
    name: "provider failure",
    reason: "provider",
    status: 200,
    response: () =>
      Response.json({
        success: false,
        errors: [{ code: 10102, message: "private-link test-token" }],
        result: { delivered: [message.to], queued: [] },
      }),
  },
  {
    name: "malformed response",
    reason: "response",
    status: 200,
    response: () => Response.json({ success: true, result: "private-link test-token" }),
  },
  {
    name: "invalid JSON",
    reason: "response",
    status: 200,
    response: () => new Response("private-link test-token"),
  },
  {
    name: "different recipient",
    reason: "not-accepted",
    status: 200,
    response: () =>
      Response.json({
        success: true,
        result: { delivered: ["other@example.com"], queued: [] },
      }),
  },
])("reports $name safely without retrying", ({ response, reason, status }) => {
  let requests = 0;
  const logs = captureLogs();

  return Effect.gen(function* () {
    const email = yield* Email.Service;
    const failure = yield* Effect.flip(email.send(message));

    assert.instanceOf(failure, Email.Unavailable);
    assert.strictEqual(requests, 1);
    assert.deepStrictEqual(
      logs.entries.map(({ message, annotations }) => ({ message, annotations })),
      [{ message: "email.cloudflare.failed", annotations: { reason, "http.status": status } }],
    );
    assert.notInclude(logs.json.join("\n"), "private-link");
    assert.notInclude(logs.json.join("\n"), "test-token");
  }).pipe(
    Effect.provide(Layer.merge(delivery, logs.layer)),
    Effect.provideService(FetchHttpClient.Fetch, () => {
      requests++;
      return Promise.resolve(response());
    }),
  );
});

it.effect("redacts transport diagnostics in failures and traces without retrying", () => {
  let requests = 0;
  const logs = captureLogs();
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
    assert.deepStrictEqual(
      logs.entries.map(({ message, annotations }) => ({ message, annotations })),
      [{ message: "email.cloudflare.failed", annotations: { reason: "request" } }],
    );
    assert.notInclude(logs.json.join("\n"), "private-link");
    assert.notInclude(logs.json.join("\n"), "test-token");

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
    Effect.provide(Layer.merge(delivery, logs.layer)),
    Effect.withTracer(tracer),
    Effect.withTracerEnabled(true),
    Effect.provideService(FetchHttpClient.Fetch, () => {
      requests++;
      return Promise.reject(new Error("private-link test-token"));
    }),
  );
});
