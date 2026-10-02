import { form, getRequestEvent, query } from "$app/server";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { ApprovalResult, HumanTask, HumanTaskId } from "@moku/domain/human-task";
import { error } from "@sveltejs/kit";
import { Effect, Match, Result, Schema } from "effect";
import type { ReviewTask } from "./review-task.ts";
import { Authentication } from "#lib/server/authentication.ts";

const request = () => {
  const event = getRequestEvent();
  Authentication.requireVerified(event.locals.user);
  return event;
};

type Failure = Effect.Error<ReturnType<HumanTaskDirectory.Interface["get"]>>;

const reject = (failure: Failure): never =>
  Match.valueTags(failure, {
    "HumanTaskStore.NotFound": () => error(404, "This task could not be found."),
    "HumanTaskStore.PersistenceError": () =>
      error(503, "We couldn’t confirm the task’s state. Refresh before trying again."),
  });

export const getHumanTask = query(
  Schema.toStandardSchemaV1(HumanTaskId),
  (id): Promise<ReviewTask> =>
    request()
      .locals.run(
        "Remote.getHumanTask",
        HumanTaskDirectory.Service.use((directory) => directory.get(id)),
      )
      .then(Result.getOrElse(reject))
      .then(Schema.encodeSync(HumanTask)),
);

export const listHumanTasks = query(() =>
  request()
    .locals.run(
      "Remote.listHumanTasks",
      HumanTaskDirectory.Service.use((directory) => directory.list),
    )
    .then(Result.getOrElse(() => error(503, "We couldn’t load your tasks. Try again.")))
    .then(Schema.encodeSync(Schema.Array(HumanTask))),
);

export const respondToHumanTask = form(
  Schema.toStandardSchemaV1(Schema.Struct({ id: HumanTaskId, ...ApprovalResult.fields }), {
    parseOptions: { onExcessProperty: "error" },
  }),
  ({ id, ...answer }) =>
    request()
      .locals.run(
        "Remote.respondToHumanTask",
        HumanTaskDirectory.Service.use((directory) =>
          directory.respond(id, answer).pipe(
            Effect.map((task) => ({ outcome: "recorded" as const, task })),
            Effect.catchTag("HumanTaskStore.AlreadyCompleted", () =>
              directory
                .get(id)
                .pipe(Effect.map((task) => ({ outcome: "already-completed" as const, task }))),
            ),
          ),
        ),
      )
      .then(Result.getOrElse(reject))
      .then(({ outcome, task }) => {
        getHumanTask(id).set(Schema.encodeSync(HumanTask)(task));
        return listHumanTasks()
          .refresh()
          .then(() => outcome);
      }),
);
