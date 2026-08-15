/**
 * Cross-runtime platform abstraction.
 * Provides file I/O, stdin, and process spawning that work on both Bun and Node.
 */

import { fileURLToPath } from "node:url";
import { readFile, writeFile, spawn } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { stdin as nodeStdin, stdout as nodeStdout, stderr as nodeStderr } from "node:process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** Detect if we're running on Bun. */
export function isBun(): boolean {
  return typeof Bun !== "undefined";
}

/** Detect if we're running on Node. */
export function isNode(): boolean {
  return !isBun();
}

/** Read entire file as text. Works on both Bun and Node. */
export async function readFileText(path: string): Promise<string> {
  if (isBun()) {
    return await Bun.file(path).text();
  }
  return await readFile(path, "utf-8");
}

/** Read entire file as bytes. Works on both Bun and Node. */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  if (isBun()) {
    return await Bun.file(path).bytes();
  }
  const buffer = await readFile(path);
  return new Uint8Array(buffer);
}

/** Check if file exists. Works on both Bun and Node. */
export async function fileExists(path: string): Promise<boolean> {
  if (isBun()) {
    return await Bun.file(path).exists();
  }
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/** Write file. Works on both Bun and Node. */
export async function writeFileText(path: string, content: string): Promise<void> {
  if (isBun()) {
    await Bun.write(path, content);
    return;
  }
  await writeFile(path, content, "utf-8");
}

/** Read stdin as text. Works on both Bun and Node. */
export async function readStdinText(): Promise<string> {
  if (isBun()) {
    return await Bun.stdin.text();
  }
  return new Promise((resolve, reject) => {
    let data = "";
    nodeStdin.setEncoding("utf-8");
    nodeStdin.on("data", (chunk) => { data += chunk; });
    nodeStdin.on("end", () => resolve(data));
    nodeStdin.on("error", reject);
    nodeStdin.resume();
  });
}

/** Stream stdin chunks. Works on both Bun and Node. */
export async function* streamStdin(): AsyncGenerator<Uint8Array, void, unknown> {
  if (isBun()) {
    for await (const chunk of Bun.stdin.stream()) {
      yield chunk;
    }
    return;
  }
  for await (const chunk of Readable.toWeb(nodeStdin) as any) {
    yield chunk;
  }
}

/** Spawn a child process. Works on both Bun and Node. */
export async function spawnProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; stdout?: "pipe" | "inherit"; stderr?: "pipe" | "inherit" } = {}
) {
  if (isBun()) {
    return Bun.spawn([command, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdout: options.stdout === "inherit" ? "inherit" : "pipe",
      stderr: options.stderr === "inherit" ? "inherit" : "pipe",
    });
  }
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: [
      "ignore",
      options.stdout === "inherit" ? "inherit" : "pipe",
      options.stderr === "inherit" ? "inherit" : "pipe",
    ],
  });
  return child;
}

/** Get stdin as a readable stream (Node only, Bun uses Bun.stdin.stream()). */
export function getStdinStream(): Readable {
  if (isBun()) {
    throw new Error("Use streamStdin() on Bun");
  }
  return nodeStdin;
}

/** Get stdout as a writable stream. */
export function getStdoutStream(): NodeJS.WritableStream {
  return nodeStdout;
}

/** Get stderr as a writable stream. */
export function getStderrStream(): NodeJS.WritableStream {
  return nodeStderr;
}