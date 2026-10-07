import { Transaction } from "@moku/core/transaction";
import { Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";

export const layer = Layer.effect(
  Transaction.Service,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return Transaction.Service.of({
      run: (effect) =>
        sql
          .withTransaction(effect.pipe(Effect.provideService(Transaction.Active, {})))
          .pipe(
            Effect.mapError((cause) =>
              SqlError.isSqlError(cause) ? new Transaction.Unavailable({ cause }) : cause,
            ),
          ),
    });
  }),
);

export * as TransactionPostgres from "./transaction-postgres.ts";
