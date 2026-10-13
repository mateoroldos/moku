import { HumanTasks } from "@moku/core/human-tasks";
import { HumanTask, HumanTaskId } from "@moku/domain/human-task";
import type { OrganizationKey } from "@moku/domain/organization";
import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

/** The organization key that authenticated the request. */
export class CurrentKey extends Context.Service<CurrentKey, OrganizationKey>()(
  "@moku/api/CurrentKey",
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { message: Schema.String },
  { httpApiStatus: 429 },
) {}

export class TaskNotFound extends Schema.TaggedError<TaskNotFound>()(
  "TaskNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class ApiKeyAuth extends HttpApiMiddleware.Service<ApiKeyAuth, { provides: CurrentKey }>()(
  "@moku/api/ApiKeyAuth",
  {
    requiredForClient: true,
    security: { bearer: HttpApiSecurity.bearer },
    error: [Unauthorized, RateLimited, HttpApiError.ServiceUnavailable],
  },
) {}

export class Tasks extends HttpApiGroup.make("tasks")
  .add(
    HttpApiEndpoint.post("create", "/tasks", {
      payload: HumanTasks.CreateInput,
      success: Schema.Struct({ id: HumanTaskId }).pipe(HttpApiSchema.status(201)),
      error: HttpApiError.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: "Create a task",
        description: "Stores the request and returns its ID without waiting for a human.",
      }),
    ),
    HttpApiEndpoint.get("get", "/tasks/:id", {
      params: { id: HumanTaskId },
      success: HumanTask,
      error: [TaskNotFound, HttpApiError.ServiceUnavailable],
    }).annotateMerge(
      OpenApi.annotations({
        summary: "Get a task",
        description: "Poll until `status` is `completed`, then read `result`.",
      }),
    ),
  )
  .middleware(ApiKeyAuth)
  .annotateMerge(OpenApi.annotations({ title: "Tasks" })) {}

export class Api extends HttpApi.make("moku")
  .add(Tasks)
  .prefix("/api/v1")
  .annotateMerge(
    OpenApi.annotations({
      title: "Moku API",
      description: "Agents ask humans for review with an organization API key.",
    }),
  ) {}

export * as MokuApi from "./moku-api.ts";
