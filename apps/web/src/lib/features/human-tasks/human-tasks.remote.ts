import { form, getRequestEvent, query } from "$app/server";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { ApprovalResult, HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import type { ReviewTask } from "./review-task.ts";
import { AuthGuard } from "#lib/server/auth-guard.ts";
import { Authentication } from "#lib/server/authentication.ts";

type Failure =
  | Effect.Error<ReturnType<HumanTaskDirectory.Interface["get"]>>
  | AuthGuard.Required
  | AuthGuard.Unverified
  | Authentication.Unavailable;

const reject = (failure: Failure): never =>
  Match.valueTags(failure, {
    "AuthGuard.Required": AuthGuard.reject,
    "AuthGuard.Unverified": AuthGuard.reject,
    "Authentication.Unavailable": AuthGuard.reject,
    "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
    "HumanTaskStore.PersistenceError": () =>
      error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
  });

export const getHumanTask = query(
  Schema.toStandardSchemaV1(HumanTaskId),
  (id): Promise<ReviewTask> =>
    getRequestEvent()
      .locals.run(
        "Remote.getHumanTask",
        Effect.gen(function* () {
          yield* AuthGuard.requireVerified;
          const directory = yield* HumanTaskDirectory.Service;
          return yield* directory.get(id);
        }),
      )
      .then(Result.getOrElse(reject))
      .then(Schema.encodeSync(HumanTask)),
);

export const listHumanTasks = query(() =>
  getRequestEvent()
    .locals.run(
      "Remote.listHumanTasks",
      Effect.gen(function* () {
        yield* AuthGuard.requireVerified;
        const directory = yield* HumanTaskDirectory.Service;
        return yield* directory.list;
      }),
    )
    .then(Result.getOrElse(reject))
    .then(Schema.encodeSync(Schema.Array(HumanTask))),
);

export const respondToHumanTask = form(
  Schema.toStandardSchemaV1(Schema.Struct({ id: HumanTaskId, ...ApprovalResult.fields }), {
    parseOptions: { onExcessProperty: "error" },
  }),
  ({ id, ...answer }) =>
    getRequestEvent()
      .locals.run(
        "Remote.respondToHumanTask",
        Effect.gen(function* () {
          yield* AuthGuard.requireVerified;
          const directory = yield* HumanTaskDirectory.Service;
          return yield* directory.respond(id, answer).pipe(
            Effect.map((task) => ({ outcome: "recorded" as const, task })),
            Effect.catchTag("HumanTaskStore.AlreadyCompleted", () =>
              directory
                .get(id)
                .pipe(Effect.map((task) => ({ outcome: "already-completed" as const, task }))),
            ),
          );
        }),
      )
      .then(Result.getOrElse(reject))
      .then(({ outcome, task }) => {
        getHumanTask(id).set(Schema.encodeSync(HumanTask)(task));
        return listHumanTasks()
          .refresh()
          .then(() => outcome);
      }),
);
