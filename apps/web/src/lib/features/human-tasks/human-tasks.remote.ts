import { form, getRequestEvent, query } from "$app/server";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { ApprovalResult, HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import type { ReviewTask } from "./review-task.ts";
import { AuthGuard } from "#lib/server/auth-guard.ts";

export const getHumanTask = query(
  Schema.toStandardSchemaV1(HumanTaskId),
  (id): Promise<ReviewTask> => {
    const event = getRequestEvent();
    return event.locals
      .run(
        "Remote.getHumanTask",
        Effect.gen(function* () {
          yield* AuthGuard.requireVerified(event);
          const directory = yield* HumanTaskDirectory.Service;
          return yield* directory.get(id);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "AuthGuard.Unverified": AuthGuard.reject,
            "Authentication.Unavailable": AuthGuard.reject,
            "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
            "HumanTaskStore.PersistenceError": () =>
              error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
          }),
        ),
      )
      .then(Schema.encodeSync(HumanTask));
  },
);

export const listHumanTasks = query(() => {
  const event = getRequestEvent();
  return event.locals
    .run(
      "Remote.listHumanTasks",
      Effect.gen(function* () {
        yield* AuthGuard.requireVerified(event);
        const directory = yield* HumanTaskDirectory.Service;
        return yield* directory.list;
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "AuthGuard.Unverified": AuthGuard.reject,
          "Authentication.Unavailable": AuthGuard.reject,
          "HumanTaskStore.PersistenceError": () =>
            error(503, "We couldn’t load your tasks. Try again."),
        }),
      ),
    )
    .then(Schema.encodeSync(Schema.Array(HumanTask)));
});

export const respondToHumanTask = form(
  Schema.toStandardSchemaV1(Schema.Struct({ id: HumanTaskId, ...ApprovalResult.fields }), {
    parseOptions: { onExcessProperty: "error" },
  }),
  ({ id, ...answer }) => {
    const event = getRequestEvent();
    return event.locals
      .run(
        "Remote.respondToHumanTask",
        Effect.gen(function* () {
          yield* AuthGuard.requireVerified(event);
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
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "AuthGuard.Unverified": AuthGuard.reject,
            "Authentication.Unavailable": AuthGuard.reject,
            "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
            "HumanTaskStore.PersistenceError": () =>
              error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
          }),
        ),
      )
      .then(({ outcome, task }) => {
        getHumanTask(id).set(Schema.encodeSync(HumanTask)(task));
        return listHumanTasks()
          .refresh()
          .then(() => outcome);
      });
  },
);
