/* oxlint-disable effecttsgo/async-function -- Tests exercise Kit's Promise-based error hook boundary. */
import { describe, expect, it } from "vitest";
import { Cause, Effect, Logger, Result, Schema, type Tracer } from "effect";
import { Observability } from "./observability.ts";

const decodeEndpoint = Schema.decodeUnknownSync(Observability.CollectorEndpoint);

const reportingFixture = () => {
  const entries: Array<ReturnType<typeof Logger.formatStructured.log>> = [];
  const spans: Array<Tracer.AnySpan | undefined> = [];
  const logger = Logger.layer([
    Logger.make((options) => {
      entries.push(Logger.formatStructured.log(options));
      spans.push(options.fiber.currentSpan);
    }),
  ]);
  const handle = (
    failure: Parameters<typeof Observability.handleError>[0],
    signal = new AbortController().signal,
  ) =>
    Effect.runPromise(
      Effect.useSpan("Remote · POST", (span) =>
        Effect.promise(() =>
          Observability.handleError(failure, signal, (error) =>
            Effect.runPromise(Observability.reportError(span, error).pipe(Effect.provide(logger))),
          ),
        ),
      ),
    );

  return { entries, spans, handle };
};

describe("server error reporting", () => {
  it.each([
    { kind: "app", error: { status: 503, message: "Service unavailable" } },
    { kind: "framework", error: { status: 500, message: "Internal error" } },
    { kind: "unknown", error: new Error("Unexpected failure") },
  ] as const)(
    "reports $kind failures with request correlation and preserves public handling",
    async (failure) => {
      const { entries, spans, handle } = reportingFixture();

      const response = await handle(failure);

      expect(response).toEqual(
        failure.kind === "unknown"
          ? { message: "Something went wrong. Refresh before trying again." }
          : undefined,
      );
      expect(entries).toMatchObject([
        {
          level: "ERROR",
          annotations: {
            "error.kind": failure.kind,
            "error.status": failure.kind === "unknown" ? 500 : failure.error.status,
            trace_id: expect.any(String),
            span_id: expect.any(String),
          },
        },
      ]);
      expect(spans[0]?.traceId).toBe(entries[0]?.annotations.trace_id);
      expect(spans[0]?.spanId).toBe(entries[0]?.annotations.span_id);
    },
  );

  it.each([
    { kind: "app", error: { status: 403, message: "Denied" } },
    { kind: "framework", error: { status: 404, message: "Not found" } },
    {
      kind: "validation",
      error: { status: 400, message: "Bad request" },
      issues: [{ message: "Enter a role" }],
    },
  ] satisfies Array<Parameters<typeof Observability.handleError>[0]>)(
    "does not report $kind rejections as incidents",
    async (failure) => {
      const { entries, handle } = reportingFixture();

      expect(await handle(failure)).toBeUndefined();
      expect(entries).toEqual([]);
    },
  );

  it.each([
    { aborted: true, mixed: false, reported: false },
    { aborted: false, mixed: false, reported: true },
    { aborted: true, mixed: true, reported: true },
  ])(
    "suppresses only aborted, interrupt-only errors: $aborted/$mixed",
    async ({ aborted, mixed, reported }) => {
      const { entries, handle } = reportingFixture();
      const controller = new AbortController();
      if (aborted) controller.abort();
      const cause = mixed
        ? Cause.combine(Cause.fail("failure"), Cause.interrupt())
        : Cause.interrupt();

      await handle(
        { kind: "unknown", error: new Error("Cancelled", { cause }) },
        controller.signal,
      );

      expect(entries).toHaveLength(reported ? 1 : 0);
    },
  );

  it("correlates reports to distinct request spans", async () => {
    const { entries, handle } = reportingFixture();
    const failure = {
      kind: "app",
      error: { status: 503, message: "Service unavailable" },
    } as const;

    await Promise.all([handle(failure), handle(failure)]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.annotations.trace_id).not.toEqual(entries[1]?.annotations.trace_id);
  });
});

describe("request tracing", () => {
  it.each([
    { kind: "request", routeId: "/(authenticated)", name: "Request · GET /", route: "/" },
    {
      kind: "data",
      routeId: "/(authenticated)/tasks/[id]",
      name: "Data · GET /tasks/[id]",
      route: "/tasks/[id]",
    },
    { kind: "request", routeId: null, name: "Request · GET unmatched", route: undefined },
    { kind: "remote", routeId: "/login", name: "Remote · GET", route: undefined },
  ] as const)(
    "names $name without exposing remote caller routes",
    ({ kind, routeId, name, route }) => {
      const spans: Array<Tracer.Span> = [];
      const response = new Response(null, { status: 503 });

      const result = Effect.runSync(
        Observability.request({ method: "GET", routeId, kind }, (span) => {
          spans.push(span);
          expect(span.status._tag).toBe("Started");
          return Effect.succeed(response);
        }),
      );

      expect(result).toBe(response);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.name).toBe(name);
      expect(spans[0]?.kind).toBe("server");
      expect(spans[0]?.status._tag).toBe("Ended");
      expect(spans[0]?.attributes.get("http.route")).toBe(route);
      expect(spans[0]?.attributes.get("http.response.status_code")).toBe(503);
    },
  );

  it("closes the span without replacing the original failure", () => {
    const spans: Array<Tracer.Span> = [];
    const failure = new Error("request failed");

    const result = Effect.runSync(
      Observability.request({ method: "GET", routeId: "/", kind: "request" }, (span) => {
        spans.push(span);
        return Effect.fail(failure);
      }).pipe(Effect.result),
    );

    expect(Result.isFailure(result) && result.failure).toBe(failure);
    expect(spans[0]?.status._tag).toBe("Ended");
    expect(spans[0]?.attributes.has("http.response.status_code")).toBe(false);
  });
});

describe("CollectorEndpoint", () => {
  it.each([
    ["http://127.0.0.1:4318", "http://127.0.0.1:4318/"],
    ["https://collector.example/otel/", "https://collector.example/otel/"],
    ["https://collector.example/%3F%23", "https://collector.example/%3F%23"],
  ])("accepts collector base URL %s", (input, expected) => {
    expect(decodeEndpoint(input).href).toBe(expected);
  });

  it.each([
    "not a URL",
    "ftp://collector.example",
    "https://user:password@collector.example",
    "https://collector.example/?query=value",
    "https://collector.example/#fragment",
    "https://collector.example/?",
    "https://collector.example/#",
  ])("rejects unsupported collector base URL %s", (input) => {
    expect(() => decodeEndpoint(input)).toThrow();
  });
});
