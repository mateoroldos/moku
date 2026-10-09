/* oxlint-disable effecttsgo/async-function -- Tests exercise the runner's public Promise boundary. */
import { assert, describe, expect, it, onTestFinished } from "vitest";
import { Cause, Deferred, Effect, Layer, Logger, ManagedRuntime, Option, Result } from "effect";
import { RequestRunner } from "./request-runner.ts";

const fixture = <E = never>(layer: Layer.Layer<never, E> = Layer.empty) => {
  const entries: Array<ReturnType<typeof Logger.formatStructured.log>> = [];
  const runtime = ManagedRuntime.make(
    Layer.merge(
      layer,
      Logger.layer([
        Logger.make((options) => {
          entries.push(Logger.formatStructured.log(options));
        }),
      ]),
    ),
  );
  onTestFinished(() => runtime.dispose());
  const controller = new AbortController();
  return { entries, runtime, controller, run: RequestRunner.make(runtime, controller.signal) };
};

describe("RequestRunner", () => {
  it("keeps concurrent requests separate while parenting their operations to one request span", async () => {
    const { runtime } = fixture();
    const bothStarted = Deferred.makeUnsafe<void>();
    let started = 0;

    const request = () =>
      runtime.runPromise(
        Effect.useSpan("Request · GET /", (parent) =>
          Effect.promise(async () => {
            const run = RequestRunner.make(runtime, new AbortController().signal, parent);
            const first = await run(
              "Authentication.request",
              Effect.gen(function* () {
                started++;
                if (started === 2) yield* Deferred.succeed(bothStarted, undefined);
                yield* Deferred.await(bothStarted);
                return yield* Effect.currentSpan;
              }),
            );
            const second = await run("Remote.listHumanTasks", Effect.currentSpan);
            assert(Result.isSuccess(first));
            assert(Result.isSuccess(second));
            for (const span of [first.success, second.success]) {
              assert.strictEqual(span.traceId, parent.traceId);
              assert.strictEqual(Option.getOrThrow(span.parent).spanId, parent.spanId);
            }
            return parent;
          }),
        ),
      );

    const [first, second] = await Promise.all([request(), request()]);
    assert.notStrictEqual(first.traceId, second.traceId);
    assert.strictEqual(first.status._tag, "Ended");
    assert.strictEqual(second.status._tag, "Ended");
  });

  it("returns values and typed failures with correlated, payload-free summaries", async () => {
    const { run, entries } = fixture();
    const value = { title: "Review the proposal" };
    const failure = { _tag: "Test.Denied", cause: { message: "password=secret SQL private" } };

    const success = await run("Test.success", Effect.succeed(value));
    const rejected = await run("Test.denied", Effect.fail(failure));

    assert(Result.isSuccess(success));
    assert.strictEqual(success.success, value);
    assert(Result.isFailure(rejected));
    assert.strictEqual(rejected.failure, failure);
    expect(entries).toMatchObject([
      {
        level: "INFO",
        annotations: {
          operation: "Test.success",
          outcome: "success",
          trace_id: expect.any(String),
          span_id: expect.any(String),
          duration_ms: expect.any(Number),
        },
      },
      {
        level: "INFO",
        annotations: {
          operation: "Test.denied",
          outcome: "failure",
          "error.type": "Test.Denied",
          "error.kind": "typed",
        },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain("password=secret");
    expect(JSON.stringify(entries)).not.toContain("SQL private");
  });

  it("does not acquire services or enter an operation for an already-aborted request", async () => {
    let acquired = false;
    let entered = false;
    const { run, controller, entries } = fixture(
      Layer.effectDiscard(
        Effect.sync(() => {
          acquired = true;
        }),
      ),
    );

    controller.abort();
    await expect(
      run(
        "Test.preAborted",
        Effect.sync(() => {
          entered = true;
        }),
      ),
    ).rejects.toMatchObject({ cause: { reasons: [{ _tag: "Interrupt" }] } });

    expect(acquired).toBe(false);
    expect(entered).toBe(false);
    expect(entries).toHaveLength(0);
  });

  const failure = { _tag: "Test.Denied" };
  it.each([
    {
      name: "multiple typed failures",
      cause: Cause.combine(Cause.fail(failure), Cause.fail({ _tag: "Test.Unavailable" })),
    },
    {
      name: "typed failure with interruption",
      cause: Cause.combine(Cause.fail(failure), Cause.interrupt()),
    },
  ])("rejects $name with all cause reasons", async ({ cause }) => {
    const { run } = fixture();
    await expect(run("Test.failure", Effect.failCause(cause))).rejects.toMatchObject({
      cause: {
        reasons: cause.reasons.map((reason) =>
          Cause.isFailReason(reason)
            ? { _tag: "Fail", error: reason.error }
            : { _tag: "Interrupt" },
        ),
      },
    });
  });

  it("retains and reports a cleanup defect alongside a typed failure", async () => {
    const { run, entries } = fixture();
    const defect = new Error("private cleanup defect");

    await expect(
      run("Test.cleanup", Effect.fail(failure).pipe(Effect.ensuring(Effect.die(defect)))),
    ).rejects.toMatchObject({
      cause: {
        reasons: [
          { _tag: "Fail", error: failure },
          { _tag: "Die", defect },
        ],
      },
    });

    expect(entries).toMatchObject([
      { level: "INFO", annotations: { outcome: "failure", "error.kind": "defect" } },
    ]);
    expect(JSON.stringify(entries)).not.toContain("private cleanup defect");
  });

  it("cancels after cleanup without disposing the runtime used by another request", async () => {
    const { run, controller, entries, runtime } = fixture();
    const started = Deferred.makeUnsafe<void>();
    let finalized = false;

    const pending = run(
      "Test.cancel",
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            finalized = true;
          }),
        );
        yield* Deferred.succeed(started, undefined);
        return yield* Effect.never;
      }).pipe(Effect.scoped),
    );
    await Effect.runPromise(Deferred.await(started));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ cause: { reasons: [{ _tag: "Interrupt" }] } });
    expect(finalized).toBe(true);
    expect(entries).toMatchObject([
      { level: "INFO", annotations: { outcome: "cancelled", "error.kind": "interruption" } },
    ]);

    const next = RequestRunner.make(runtime, new AbortController().signal);
    const result = await next("Test.nextRequest", Effect.succeed(42));
    assert(Result.isSuccess(result));
    expect(result.success).toBe(42);
  });

  it("rejects runtime acquisition failure without an operation summary", async () => {
    const unavailable = { _tag: "Test.AcquisitionFailed" };
    let entered = false;
    const { run, entries } = fixture(Layer.effectDiscard(Effect.fail(unavailable)));

    await expect(
      run(
        "Test.unentered",
        Effect.sync(() => {
          entered = true;
        }),
      ),
    ).rejects.toMatchObject({ cause: { reasons: [{ _tag: "Fail", error: unavailable }] } });

    expect(entered).toBe(false);
    expect(entries).toHaveLength(0);
  });
});
