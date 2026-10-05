import { describe, expect, it } from "vitest";
import { Effect, Result, Schema, type Tracer } from "effect";
import { Observability } from "./observability.ts";

const decodeEndpoint = Schema.decodeUnknownSync(Observability.CollectorEndpoint);

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
