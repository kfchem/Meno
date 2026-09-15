import { ensurePyEnv } from "../../../lib/pyEnv";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveResource } from "@tauri-apps/api/path";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type Profile = "console" | "node";

export default function PyConsole() {
  const [pid, setPid] = useState<string | null>(null);
  // Mirrors `pid` for the event listeners, which are registered once. Set
  // synchronously as soon as the sidecar id is known so no output is dropped
  // while React re-renders.
  const pidRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [profile, setProfile] = useState<Profile>("console");
  const outRef = useRef<HTMLDivElement>(null);
  const append = useCallback((s: string) => {
    if (!outRef.current) return;
    outRef.current.textContent += s + "\n";
    outRef.current.scrollTop = outRef.current.scrollHeight;
  }, []);

  const setCurrentPid = useCallback((id: string | null) => {
    pidRef.current = id;
    setPid(id);
  }, []);

  useEffect(() => {
    // `listen` resolves asynchronously; if the effect is cleaned up first
    // (e.g. React StrictMode's mount/unmount/mount), unlisten immediately
    // instead of leaking a duplicate listener.
    let disposed = false;
    const unsubs: UnlistenFn[] = [];
    const track = (p: Promise<UnlistenFn>) =>
      p.then((u) => (disposed ? u() : unsubs.push(u))).catch(() => {});

    track(listen<string>("uv:log", (e) => append(e.payload)));
    track(listen<string>("uv:err", (e) => append(`[uv:err] ${e.payload}`)));

    track(
      listen<string>("ext:stdout", (e) => {
        try {
          const { id, line } = JSON.parse(e.payload);
          if (id !== pidRef.current) return;

          if (line && line[0] === "{") {
            try {
              const msg = JSON.parse(line);
              if (msg?.event === "exec_done") {
                if (msg.stdout) append(msg.stdout.replace(/\n$/, ""));
                if (msg.stderr)
                  append(`[stderr] ${msg.stderr.replace(/\n$/, "")}`);
                return;
              }
              if (msg?.event === "pong") {
                append("pong");
                return;
              }
            } catch {}
          }
          append(line);
        } catch {
          append(String(e.payload));
        }
      })
    );

    track(
      listen<string>("ext:stderr", (e) => {
        try {
          const { id, line } = JSON.parse(e.payload);
          if (id === pidRef.current) append(`[stderr] ${line}`);
        } catch {
          append(`[stderr] ${e.payload}`);
        }
      })
    );

    track(
      listen<string>("ext:exit", (e) => {
        try {
          const { id } = JSON.parse(e.payload);
          if (id === pidRef.current) setCurrentPid(null);
        } catch {}
      })
    );

    return () => {
      disposed = true;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [append, setCurrentPid]);

  const start = useCallback(async () => {
    if (pid || busy) return;
    setBusy(true);
    try {
      const venvPy = await ensurePyEnv(profile);
      const workerAbs = await resolveResource(
        "resources/workers/interactive_worker.py"
      );

      const id = await invoke<string>("ext_spawn_sidecar", {
        payload: { entry: venvPy, args: ["-u", workerAbs] },
      });
      setCurrentPid(id);
      append(`[env:${profile}] ready`);

      await invoke("ext_stdin", {
        id,
        data: JSON.stringify({ req: "exec", code: 'print("AUTO OK")' }) + "\n",
      });
    } catch (e) {
      append(`[error] failed to start Python (${profile}): ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [pid, busy, profile, append, setCurrentPid]);

  const run = useCallback(async () => {
    if (!pid) return;
    try {
      await invoke("ext_stdin", {
        id: pid,
        data: JSON.stringify({ req: "exec", code }) + "\n",
      });
      setCode("");
    } catch (e) {
      append(`[error] ${String(e)}`);
    }
  }, [pid, code, append]);

  const stop = useCallback(async () => {
    if (pid) {
      await invoke("ext_kill", { id: pid });
      append("invoked ext_kill");
      setCurrentPid(null);
    }
  }, [pid, append, setCurrentPid]);

  const onSwitch = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (pid) return;
      setProfile(e.target.value as Profile);
      outRef.current && (outRef.current.textContent = "");
    },
    [pid]
  );

  return (
    <div className="w-full h-full p-3 grid grid-cols-2 gap-3 text-gh-black">
      <div className="flex flex-col">
        <div className="mb-2 flex items-center gap-2">
          <select
            value={profile}
            onChange={onSwitch}
            className="px-2 py-1 border rounded-md border-gh-line"
          >
            <option value="console">console</option>
            <option value="node">node</option>
          </select>
          <button
            onClick={start}
            className="px-3 py-1 border rounded-md border-gh-line"
            disabled={busy}
          >
            {busy ? "Setting up..." : "Start"}
          </button>
          <button
            onClick={run}
            className="px-3 py-1 border rounded-md border-gh-line"
            disabled={!pid}
          >
            Run
          </button>
          <button
            onClick={stop}
            className="px-3 py-1 border rounded-md border-gh-line"
            disabled={!pid}
          >
            Stop
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1 border rounded-md border-gh-line p-3 font-mono text-sm"
          placeholder='print("Hello World")'
        />
      </div>
      <div
        ref={outRef}
        className="flex-1 border rounded-md border-gh-line p-3 text-xs font-mono whitespace-pre-wrap overflow-auto"
      />
    </div>
  );
}
