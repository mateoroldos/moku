import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { ApprovalResult } from "@moku/domain/human-task";
import { Config, Console, Effect, Layer, Schema } from "effect";
import { WebRuntime } from "#lib/server/runtime.ts";

const examples = Schema.decodeSync(
  Schema.Array(
    Schema.Struct({
      request: HumanTaskDirectory.CreateInput,
      result: Schema.optionalKey(ApprovalResult),
    }),
  ),
)([
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Authorize a paper-trading order",
        description:
          "Buy 10 shares of ACME in the paper-trading account.\nLimit price: $125 per share. Maximum simulated exposure: $1,250.",
      },
      context:
        "The strategy proposes this position after its daily rebalance. Check the quantity and exposure before authorizing. This is a simulation; no real money will move.",
      response: { type: "approval" },
    },
  },
  {
    request: {
      intent: "authorize",
      subject: { title: "Authorize publication of the weekly report" },
      response: { type: "approval" },
    },
  },
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Send the release summary to the team",
        description:
          "Send the reviewed summary to the internal engineering channel. The message contains release notes and a link to the deployment checklist.",
      },
      response: { type: "approval" },
    },
    result: { decision: "approved", feedback: "The summary matches the reviewed release notes." },
  },
  {
    request: {
      intent: "authorize",
      subject: {
        title: "Publish the customer case study",
        description:
          "Publish the draft case study on the public website, including the customer's name and performance figures.",
      },
      context:
        "The draft has been edited, but written permission to use the customer’s name has not been attached.",
      response: { type: "approval" },
    },
    result: {
      decision: "rejected",
      feedback: "Obtain the customer's written permission before requesting publication again.",
    },
  },
]);

NodeRuntime.runMain(
  Effect.gen(function* () {
    const baseUrl = yield* Config.url("REVIEW_BASE_URL").pipe(
      Config.withDefault(new URL("http://127.0.0.1:5173")),
    );
    const directory = yield* HumanTaskDirectory.Service;
    for (const { request, result } of examples) {
      const pending = yield* directory.create(request);
      const task = result === undefined ? pending : yield* directory.respond(pending.id, result);
      yield* Console.log(
        `${task.status === "pending" ? "pending" : task.result.decision} · ${task.subject.title}\n${new URL(`/tasks/${task.id}`, baseUrl).href}`,
      );
    }
    yield* Console.log("Added four example tasks. Existing tasks and decisions were preserved.");
  }).pipe(
    Effect.provide(
      Layer.unwrap(Config.redacted("DATABASE_URL").pipe(Effect.map(WebRuntime.layer))),
    ),
  ),
);
