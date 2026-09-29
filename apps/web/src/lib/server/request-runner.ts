import { Cause, Effect, Exit, ManagedRuntime, Result } from "effect";
import { Observability } from "./observability.ts";

/** Executes request operations without reducing mixed causes to a single typed failure. */
export function make<Services, InitializationError>(
  runtime: ManagedRuntime.ManagedRuntime<Services, InitializationError>,
  signal: AbortSignal,
) {
  // oxlint-disable-next-line effecttsgo/async-function -- This boundary translates Effect exits into Promise results and rejections.
  return async function run<Value, Failure extends { readonly _tag: string }>(
    name: string,
    program: Effect.Effect<Value, Failure, Services>,
  ): Promise<Result.Result<Value, Failure>> {
    // Effect evaluates synchronous work before attaching the signal listener.
    if (signal.aborted) {
      throw new Error(`Application operation ${name} cancelled`, { cause: Cause.interrupt() });
    }
    const runtimeExit = await runtime.runPromiseExit(
      program.pipe(
        Effect.tapError((failure) => Effect.annotateCurrentSpan("error.type", failure._tag)),
        Observability.operation(name),
        Effect.exit,
      ),
      { signal },
    );

    // Acquisition or execution failed before yielding an operation outcome.
    if (Exit.isFailure(runtimeExit)) {
      throw new Error(`Application operation ${name} failed`, { cause: runtimeExit.cause });
    }

    const operationExit = runtimeExit.value;
    if (Exit.isSuccess(operationExit)) return Result.succeed(operationExit.value);

    const cause = operationExit.cause;
    const [reason] = cause.reasons;
    if (cause.reasons.length === 1 && reason !== undefined && Cause.isFailReason(reason)) {
      return Result.fail(reason.error);
    }

    throw new Error(`Application operation ${name} failed`, { cause });
  };
}

export * as RequestRunner from "./request-runner.ts";
