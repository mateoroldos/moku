import { Cause, Clock, Effect, Exit, Layer, Logger, Schema, type Tracer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/unstable/observability";

export const CollectorEndpoint = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.href.includes("?") &&
    !url.href.includes("#")
      ? undefined
      : "Expected an HTTP(S) collector base URL without credentials, query or fragment",
  ),
);

interface RequestMetadata {
  readonly method: string;
  readonly routeId: string | null;
  readonly kind: "request" | "data" | "remote";
}

export const request = <E, R>(
  metadata: RequestMetadata,
  resolve: (span: Tracer.Span) => Effect.Effect<Response, E, R>,
): Effect.Effect<Response, E, R> => {
  const route =
    metadata.routeId === null
      ? "unmatched"
      : metadata.routeId.replace(/\/\([^/)]+\)(?=\/|$)/g, "") || "/";
  const kind = { request: "Request", data: "Data", remote: "Remote" }[metadata.kind];
  const name = `${kind} · ${metadata.method}${metadata.kind === "remote" ? "" : ` ${route}`}`;
  return Effect.useSpan(
    name,
    {
      kind: "server",
      attributes: {
        "http.request.method": metadata.method,
        "app.request.kind": metadata.kind,
        "app.span.kind": "request_scope",
      },
    },
    (span) => {
      if (metadata.kind !== "remote" && metadata.routeId !== null)
        span.attribute("http.route", route);
      return resolve(span).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            span.attribute("http.response.status_code", response.status);
          }),
        ),
      );
    },
  );
};

/** One summary per application operation; Effect owns the span and original result. */
export const operation =
  (name: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.useSpan(name, (span) =>
      self.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            const clock = yield* Clock.Clock;
            const outcome = Exit.isSuccess(exit)
              ? "success"
              : Cause.hasInterruptsOnly(exit.cause)
                ? "cancelled"
                : "failure";
            if (Exit.isFailure(exit)) {
              yield* Effect.annotateCurrentSpan(
                "error.kind",
                Cause.hasDies(exit.cause)
                  ? "defect"
                  : outcome === "cancelled"
                    ? "interruption"
                    : "typed",
              );
            }
            yield* (outcome === "failure" ? Effect.logError : Effect.logInfo)(
              "application.operation.completed",
            ).pipe(
              Effect.annotateLogs({
                ...Object.fromEntries(span.attributes),
                operation: name,
                outcome,
                duration_ms:
                  Number(clock.currentTimeNanosUnsafe() - span.status.startTime) / 1_000_000,
                trace_id: span.traceId,
                span_id: span.spanId,
              }),
            );
          }),
        ),
        Effect.withParentSpan(span),
      ),
    );

export interface Settings {
  readonly endpoint?: string;
  readonly dev?: boolean;
}

export const layer = ({ endpoint, dev = false }: Settings) => {
  const console = Logger.layer([
    Logger.withLeveledConsole(dev ? Logger.formatLogFmt : Logger.formatJson),
  ]);
  if (endpoint === undefined) return console;

  const base = endpoint.replace(/\/$/, "");
  const options = {
    resource: { serviceName: "moku.web" },
    shutdownTimeout: "1 second",
  } as const;
  return Layer.merge(
    OtlpTracer.layer({ ...options, url: `${base}/v1/traces` }),
    OtlpLogger.layer({ ...options, url: `${base}/v1/logs` }),
  ).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(FetchHttpClient.layer),
    Layer.provideMerge(console),
  );
};

export * as Observability from "./observability.ts";
