/* oxlint-disable effecttsgo/async-function, effecttsgo/global-fetch, effecttsgo/new-promise, effecttsgo/node-builtin-import -- Black-box Node process/HTTP harness; application Effects run inside the child server. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { PgClient } from "@effect/sql-pg";
import { HumanTaskDirectory } from "@moku/core/human-task-directory";
import { hashPassword } from "better-auth/crypto";
import { Config, Effect, ManagedRuntime, Redacted, Schema } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { WebRuntime } from "./runtime.ts";

const origin = "http://localhost:3000";
const credentials = { email: "http-auth@moku.test", password: "http-test-password" };
const url = Effect.runSync(Config.redacted("TEST_DATABASE_URL"));
const database = ManagedRuntime.make(PgClient.layer({ url }));
const tasks = ManagedRuntime.make(WebRuntime.layer(url));
const sql = await database.runPromise(PgClient.PgClient);
let base: string;
let taskId: string;
let logs = "";
let server: ReturnType<typeof spawn> | undefined;

const request = (path: string, cookie = "", body?: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: { origin, cookie, "content-type": "application/json", ...headers },
    body: body ?? null,
  });
const login = async () => {
  const response = await request("/api/auth/sign-in/email", "", JSON.stringify(credentials));
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies.join(";")).toContain("HttpOnly");
  expect(cookies.join(";")).toContain("SameSite=Lax");
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
};
const remote = (name: string, cookie: string) => {
  const id = `3xttk4/${name}`;
  const path = `/_app/remote/${id}`;
  const headers = {
    "x-sveltekit-pathname": "/login",
    "content-type": "application/x-www-form-urlencoded",
  };
  if (name === "respondToHumanTask")
    return request(
      path,
      cookie,
      new URLSearchParams({
        [`id/${id}`]: taskId,
        [`decision/${id}`]: "approved",
        [`feedback/${id}`]: "Reviewed",
      }).toString(),
      headers,
    );
  const payload =
    name === "getHumanTask"
      ? `?payload=${Buffer.from(JSON.stringify([taskId])).toString("base64url")}`
      : "";
  return request(path + payload, cookie, undefined, headers);
};
type Rejection =
  | { type: "error"; error: { status: 403 | 503 } }
  | { type: "result"; data: ReturnType<typeof expect.stringContaining> };
const rejected = async (cookie: string, expected: Rejection) => {
  for (const name of ["listHumanTasks", "getHumanTask", "respondToHumanTask"]) {
    expect(await (await remote(name, cookie)).json(), name).toMatchObject(expected);
  }
  const [task] = await database.runPromise(
    sql`SELECT status FROM human_tasks WHERE id = ${taskId}`,
  );
  expect(task?.status).toBe("pending");
};

beforeAll(async () => {
  const password = await hashPassword(credentials.password);
  await database.runPromise(sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('http-auth-user', 'Reviewer', ${credentials.email}, true, now(), now())`);
  await database.runPromise(sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES ('http-auth-account', 'http-auth-user', 'credential', 'http-auth-user', ${password}, now(), now())`);
});

beforeEach(async () => {
  logs = "";
  const input = Schema.decodeSync(HumanTaskDirectory.CreateInput)({
    intent: "authorize",
    subject: { title: "HTTP authentication review" },
    response: { type: "approval" },
  });
  taskId = (
    await tasks.runPromise(HumanTaskDirectory.Service.use((directory) => directory.create(input)))
  ).id;
  server = spawn(process.execPath, ["build/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      TEST: "false",
      DATABASE_URL: Redacted.value(url),
      ORIGIN: origin,
      HOST: "127.0.0.1",
      PORT: "0",
      BETTER_AUTH_SECRET: "http-test-only-secret-for-authentication-123456",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.once("exit", (code) => reject(new Error(`Server exited ${code}: ${logs}`)));
    server?.stdout?.on("data", (chunk) => {
      logs += String(chunk);
      const listening = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(logs);
      if (listening) {
        base = listening[1]!;
        resolve();
      }
    });
  });
});

afterEach(async () => {
  if (server && server.exitCode === null) {
    const closed = once(server, "exit");
    server.kill("SIGTERM");
    await closed;
  }
  await database.runPromise(sql`DELETE FROM human_tasks WHERE id = ${taskId}`);
  expect(logs).not.toContain(credentials.password);
  expect(logs).not.toContain("http-test-only-secret");
  expect(logs).not.toContain("private-delete-outage");
});

afterAll(async () => {
  await tasks.dispose();
  await database.runPromise(sql`DELETE FROM "user" WHERE id = 'http-auth-user'`);
  await database.dispose();
});

test("protects direct list, read and answer calls across identity changes", async () => {
  await rejected("", { type: "result", data: expect.stringContaining('"/login"') });
  const cookie = await login();
  await database.runPromise(
    sql`UPDATE "user" SET email_verified = false WHERE id = 'http-auth-user'`,
  );
  try {
    await rejected(cookie, { type: "error", error: { status: 403 } });
    expect((await request("/api/auth/sign-in/email", "", JSON.stringify(credentials))).status).toBe(
      403,
    );
  } finally {
    await database.runPromise(
      sql`UPDATE "user" SET email_verified = true WHERE id = 'http-auth-user'`,
    );
  }
  await database.runPromise(
    sql`UPDATE session SET expires_at = now() - interval '1 second' WHERE user_id = 'http-auth-user'`,
  );
  await rejected(cookie, { type: "result", data: expect.stringContaining('"/login"') });
  const current = await login();
  expect((await request("/api/auth/sign-out", current, "{}")).status).toBe(200);
  await rejected(current, { type: "result", data: expect.stringContaining('"/login"') });
});

test("rejected signout cannot revoke the session", async () => {
  const cookie = await login();
  expect((await request("/api/auth/sign-out", cookie, "not JSON")).status).toBe(400);
  expect(
    (await request("/api/auth/sign-out", cookie, '{"disableRedirect":"invalid"}')).status,
  ).toBe(400);
  expect(
    (await request("/api/auth/sign-out", cookie, '{"callbackURL":"https://outsider.test"}')).status,
  ).toBe(403);
  expect(
    (await request("/api/auth/sign-out", cookie, "{}", { origin: "https://outsider.test" })).status,
  ).toBe(403);
  expect((await request("/api/auth/sign-up/email", "", JSON.stringify(credentials))).status).toBe(
    404,
  );
  expect((await request("/", cookie)).status).toBe(200);
});

test("rate limits by transport address, ignoring caller-supplied client IP headers", async () => {
  const attempt = (localAddress: string, claimedAddress: string) =>
    new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        `${base}/api/auth/sign-in/email`,
        {
          method: "POST",
          localAddress,
          headers: {
            origin,
            "content-type": "application/json",
            "x-moku-client-ip": claimedAddress,
            "x-forwarded-for": claimedAddress,
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.once("error", reject);
      request.end(JSON.stringify({ ...credentials, password: "wrong-password" }));
    });
  expect(await attempt("127.0.0.2", "192.0.2.1")).toBe(401);
  expect(await attempt("127.0.0.2", "192.0.2.2")).toBe(401);
  expect(await attempt("127.0.0.2", "192.0.2.3")).toBe(401);
  expect(await attempt("127.0.0.2", "192.0.2.4")).toBe(429);
  expect(await attempt("127.0.0.3", "192.0.2.4")).toBe(401);
});

test("failed revocation retains cookies and the session; successful review and signout recover", async () => {
  const cookie = await login();
  await database.runPromise(sql`CREATE FUNCTION reject_auth_delete() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'private-delete-outage'; END $$`);
  await database.runPromise(sql`CREATE TRIGGER reject_auth_delete BEFORE DELETE ON session
    FOR EACH ROW EXECUTE FUNCTION reject_auth_delete()`);
  try {
    const failure = await request("/api/auth/sign-out", cookie, "{}");
    expect(failure.status).toBe(503);
    expect(failure.headers.getSetCookie()).toEqual([]);
    expect((await request("/", cookie)).status).toBe(200);
  } finally {
    await database.runPromise(sql`DROP TRIGGER reject_auth_delete ON session`);
    await database.runPromise(sql`DROP FUNCTION reject_auth_delete()`);
  }
  await database.runPromise(sql`ALTER TABLE session RENAME TO session_unavailable`);
  try {
    expect((await request("/login")).status).toBe(200);
    await rejected(cookie, { type: "error", error: { status: 503 } });
    const logout = await request("/api/auth/sign-out", cookie, "{}");
    expect(logout.status).toBe(503);
    expect(logout.headers.getSetCookie()).toEqual([]);
  } finally {
    await database.runPromise(sql`ALTER TABLE session_unavailable RENAME TO session`);
  }
  expect(await (await remote("getHumanTask", cookie)).json()).toMatchObject({ type: "result" });
  expect(await (await remote("respondToHumanTask", cookie)).json()).toMatchObject({
    type: "result",
  });
  const [task] = await database.runPromise(
    sql`SELECT status FROM human_tasks WHERE id = ${taskId}`,
  );
  expect(task?.status).toBe("completed");
  const logout = await request("/api/auth/sign-out", cookie, "{}");
  expect(logout.status).toBe(200);
  expect(logout.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  expect((await request("/", cookie)).status).toBe(303);
});
