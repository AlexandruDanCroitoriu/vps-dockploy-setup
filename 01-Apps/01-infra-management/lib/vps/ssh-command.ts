import "server-only";

import { Client } from "ssh2";

export function runVpsCommand(input: {
  ipAddress: string;
  password: string;
  command: string;
  timeoutMs?: number;
}) {
  return new Promise<void>((resolve, reject) => {
    const connection = new Client();
    const timeout = setTimeout(
      () => {
        connection.end();
        reject(new Error("The VPS operation timed out."));
      },
      input.timeoutMs ?? 30 * 60 * 1_000,
    );
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      connection.end();
      if (error) reject(error);
      else resolve();
    };
    connection
      .once("ready", () => {
        connection.exec(input.command, {}, (error, stream) => {
          if (error)
            return finish(new Error("Unable to start the VPS operation."));
          stream.stderr.resume();
          stream.on("close", (code: number | null) => {
            finish(
              code === 0
                ? undefined
                : new Error("The PostgreSQL restore failed on the VPS."),
            );
          });
          stream.resume();
        });
      })
      .once("error", () =>
        finish(new Error("Unable to authenticate to the VPS as root.")),
      )
      .connect({
        host: input.ipAddress,
        port: 22,
        username: "root",
        password: input.password,
        readyTimeout: 30_000,
        keepaliveInterval: 10_000,
      });
  });
}
