import sys
import json
import io
import contextlib
import traceback

G = {}

print("WORKER READY", flush=True)


def run(code):
    so = io.StringIO()
    se = io.StringIO()
    with contextlib.redirect_stdout(so), contextlib.redirect_stderr(se):
        try:
            co = compile(code, "<cell>", "exec")
            exec(co, G, G)
            return {
                "ok": True,
                "stdout": so.getvalue(),
                "stderr": se.getvalue(),
            }
        except Exception:
            traceback.print_exc()
            return {
                "ok": False,
                "stdout": so.getvalue(),
                "stderr": se.getvalue(),
            }


for line in sys.stdin:
    s = line.strip()
    if not s:
        continue
    m = json.loads(s)
    if m.get("req") == "exec":
        r = run(m.get("code", ""))
        sys.stdout.write(
            json.dumps(
                {
                    "event": "exec_done",
                    "ok": r["ok"],
                    "stdout": r["stdout"],
                    "stderr": r["stderr"],
                }
            )
            + "\n"
        )
        sys.stdout.flush()
