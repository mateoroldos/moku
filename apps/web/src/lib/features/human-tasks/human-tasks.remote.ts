import { form, getRequestEvent, query } from "$app/server";
import { HumanTasks } from "@moku/core/human-tasks";
import { ApprovalResult, HumanTask, HumanTaskId, TaskRef } from "@moku/domain/human-task";
import { OrganizationId } from "@moku/domain/organization";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import type { ReviewTask } from "./review-task.ts";
import { AuthGuard } from "#lib/server/auth-guard.ts";

export const getHumanTask = query(
  Schema.toStandardSchemaV1(TaskRef),
  (ref): Promise<ReviewTask> => {
    const event = getRequestEvent();
    return event.locals
      .run(
        "Remote.getHumanTask",
        Effect.gen(function* () {
          const principal = yield* AuthGuard.requireVerifiedEmail(event.locals.authenticate);
          const humanTasks = yield* HumanTasks.Service;

          return yield* humanTasks.get(principal, ref);
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This task could not be found."),
            "Access.Denied": () => error(403, "Your role does not allow viewing this task."),
            "OrganizationMembershipStore.Unavailable": () =>
              error(503, "We couldn’t verify your access. Try again."),
            "AuthProvider.Unavailable": AuthGuard.reject,
            "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
            "HumanTaskStore.PersistenceError": () =>
              error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
          }),
        ),
      )
      .then(Schema.encodeSync(HumanTask));
  },
);

export const listHumanTasks = query(Schema.toStandardSchemaV1(OrganizationId), (organizationId) => {
  const event = getRequestEvent();
  return event.locals
    .run(
      "Remote.listHumanTasks",
      Effect.gen(function* () {
        const principal = yield* AuthGuard.requireVerifiedEmail(event.locals.authenticate);
        const humanTasks = yield* HumanTasks.Service;

        return yield* humanTasks.list(principal, organizationId);
      }),
    )
    .then(
      Result.getOrElse((failure) =>
        Match.valueTags(failure, {
          "AuthGuard.Required": AuthGuard.reject,
          "Access.UnverifiedEmail": AuthGuard.reject,
          "Access.NotFound": () => error(404, "This organization could not be found."),
          "Access.Denied": () => error(403, "Your role does not allow viewing tasks."),
          "OrganizationMembershipStore.Unavailable": () =>
            error(503, "We couldn’t verify your access. Try again."),
          "AuthProvider.Unavailable": AuthGuard.reject,
          "HumanTaskStore.PersistenceError": () =>
            error(503, "We couldn’t load your tasks. Try again."),
        }),
      ),
    )
    .then(Schema.encodeSync(Schema.Array(HumanTask)));
});

export const respondToHumanTask = form(
  Schema.toStandardSchemaV1(
    Schema.Struct({ id: HumanTaskId, organizationId: OrganizationId, ...ApprovalResult.fields }),
    {
      parseOptions: { onExcessProperty: "error" },
    },
  ),
  ({ id, organizationId, ...answer }) => {
    const ref = { taskId: id, organizationId };
    const event = getRequestEvent();
    return event.locals
      .run(
        "Remote.respondToHumanTask",
        Effect.gen(function* () {
          const principal = yield* AuthGuard.requireVerifiedEmail(event.locals.authenticate);
          const humanTasks = yield* HumanTasks.Service;

          return yield* humanTasks.respond(principal, ref, answer).pipe(
            Effect.map((task) => ({ outcome: "recorded" as const, task })),
            Effect.catchTag("HumanTaskStore.AlreadyCompleted", () =>
              humanTasks
                .get(principal, ref)
                .pipe(Effect.map((task) => ({ outcome: "already-completed" as const, task }))),
            ),
          );
        }),
      )
      .then(
        Result.getOrElse((failure) =>
          Match.valueTags(failure, {
            "AuthGuard.Required": AuthGuard.reject,
            "Access.UnverifiedEmail": AuthGuard.reject,
            "Access.NotFound": () => error(404, "This task could not be found."),
            "Access.Denied": () =>
              error(403, "Your role allows viewing tasks, but not answering them."),
            "OrganizationMembershipStore.Unavailable": () =>
              error(503, "We couldn’t verify your access. Try again."),
            "AuthProvider.Unavailable": AuthGuard.reject,
            "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
            "HumanTaskStore.PersistenceError": () =>
              error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
          }),
        ),
      )
      .then(({ outcome, task }) => {
        getHumanTask(ref).set(Schema.encodeSync(HumanTask)(task));
        return listHumanTasks(organizationId)
          .refresh()
          .then(() => outcome);
      });
  },
);
