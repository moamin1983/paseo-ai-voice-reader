// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute } from "node:path";
import { createInterface, type Interface } from "node:readline";
import type { Preferences } from "../shared/settings";

export class SpeechWorker {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private key = "";
  private closed = false;
  private pending?: {
    resolve: (x: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private tail: Promise<unknown> = Promise.resolve();
  request(p: Preferences, data: Record<string, unknown>): Promise<unknown> {
    const job = this.tail.then(() => this.run(p, data));
    this.tail = job.catch(() => {});
    return job;
  }
  private run(p: Preferences, data: Record<string, unknown>): Promise<unknown> {
    if (this.closed) throw new Error("Voice plugin unloaded.");
    if (!p.pythonPath.trim() || !isAbsolute(p.workerPath))
      throw new Error("Set the Python executable and absolute plugin TTS worker path in Voice settings. Run scripts/setup-tts.sh for the suggested paths.");
    const key = `${p.pythonPath}\n${p.workerPath}`;
    if (this.child && this.key !== key) this.kill("TTS configuration changed.");
    if (!this.child) {
      this.key = key;
      this.child = spawn(p.pythonPath, ["-u", p.workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      const child = this.child;
      this.lines = createInterface({ input: child.stdout });
      this.lines.on("line", (line) => {
        if (this.child !== child || !this.pending) return;
        try {
          const reply = JSON.parse(line) as {
            ok: boolean;
            result: unknown;
            error?: string;
          };
          if (typeof reply.ok !== "boolean") return;
          const current = this.pending;
          this.pending = undefined;
          clearTimeout(current.timer);
          if (reply.ok) current.resolve(reply.result);
          else current.reject(new Error(reply.error ?? "TTS failed."));
        } catch {
          /* Ignore nonprotocol library output. Never log text or raw errors. */
        }
      });
      child.stderr.on("data", () => {});
      child.on("error", () => {
        if (this.child === child)
          this.kill(
            "Cannot launch TTS worker. Check Python and worker paths in settings.",
          );
      });
      child.on("exit", () => {
        if (this.child === child)
          this.kill("TTS worker exited. Check dependencies and models.");
      });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.kill("TTS timed out. No automatic cloud/offline fallback."),
        60_000,
      );
      this.pending = { resolve, reject, timer };
      this.child!.stdin.write(
        JSON.stringify({ modelDir: p.kokoroModelDir, ...data }) + "\n",
        (error) => {
          if (error) this.kill("TTS input failed.");
        },
      );
    });
  }
  private kill(message: string) {
    const child = this.child;
    this.child = undefined;
    this.lines?.close();
    this.lines = undefined;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(message));
      this.pending = undefined;
    }
    if (child) {
      child.stdin.destroy();
      child.kill("SIGKILL");
    }
  }
  dispose() {
    this.closed = true;
    this.kill("Voice plugin unloaded.");
  }
}
