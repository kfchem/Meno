/**
 * Asking a reader plugin's worker (resources/workers/reader_*.py): one JSON
 * object a line each way, answers matched to questions by id, as Meno's
 * chemistry worker is asked (lib/rdkit/client). It reads what it is sent,
 * and nothing else.
 *
 * The transport is handed in, so that the client knows nothing of how the
 * worker runs (a sidecar, here; anything that carries lines, in tests).
 */
import type { ReaderOutput } from "./output";

/**
 * A reader, however it runs - a plugin's worker, or one that comes with
 * Meno: what it makes of a file, and a promise it gave, asked for.
 */
export interface Reader {
  /** Its version, once it has said; a reader that comes with Meno, empty. */
  version: string | null;
  read(name: string, text: string): Promise<ReaderOutput>;
  /** What a promise it gave stands for - by its key - the file's name and text sent again. */
  ask(key: string, name: string, text: string): Promise<unknown>;
}

export type ReaderTransport = {
  send(line: string): void;
  /** Hears each line the worker writes; the function returned stops it. */
  listen(onLine: (line: string) => void): () => void;
};

/** How long a reader may take over one file: a long output, a slow machine. */
const TIMEOUT_MS = 120_000;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ReaderClient implements Reader {
  private next = 1;
  private pending = new Map<number, Pending>();
  private stop: () => void;
  /** The reader's version, once its worker has said it is ready. */
  version: string | null = null;
  readonly ready: Promise<string>;

  constructor(
    /** What it is called in messages: "cclib". */
    private name: string,
    private transport: ReaderTransport,
    private timeoutMs = TIMEOUT_MS,
  ) {
    let markReady!: (v: string) => void;
    this.ready = new Promise((resolve) => (markReady = resolve));
    this.stop = transport.listen((line) => this.receive(line, markReady));
  }

  private receive(line: string, markReady: (v: string) => void) {
    let m: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string; version?: string };
    try {
      m = JSON.parse(line);
    } catch {
      return; // not an answer: what the reader's library printed, say
    }
    if (m.event === "ready") {
      this.version = m.version ?? "";
      markReady(this.version);
      return;
    }
    const p = typeof m.id === "number" ? this.pending.get(m.id) : undefined;
    if (!p) return;
    this.pending.delete(m.id!);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error ?? `${this.name} could not read it`));
  }

  /** What the reader makes of a file: its name, as given, and its text. */
  read(name: string, text: string): Promise<ReaderOutput> {
    return this.request({ op: "read", name, text }, `reading ${name}`) as Promise<ReaderOutput>;
  }

  /** What a promise the reader gave stands for, by its key: the file it read sent again. */
  ask(key: string, name: string, text: string): Promise<unknown> {
    return this.request({ op: "ask", key, name, text }, `working out ${key} of ${name}`);
  }

  private request(question: Record<string, unknown>, what: string): Promise<unknown> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} did not finish ${what} in time`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send(JSON.stringify({ id, ...question }));
    });
  }

  /** Stops listening; whatever is still waiting fails. */
  close(reason = `the ${this.name} reader stopped`): void {
    this.stop();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
