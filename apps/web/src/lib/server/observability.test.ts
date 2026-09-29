import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { Observability } from "./observability.ts";

const decodeEndpoint = Schema.decodeUnknownSync(Observability.CollectorEndpoint);

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
