import { Email } from "@moku/core/email";
import { Console, Effect, Layer, Redacted } from "effect";

export const layer = Layer.succeed(Email.Service, {
  send: Effect.fn("Email.send")((message: Email.Message) =>
    Console.log(
      `[email] To: ${message.to}\nSubject: ${message.subject}\n${Redacted.value(message.text)}`,
    ),
  ),
});

export * as EmailConsole from "./email-console.ts";
