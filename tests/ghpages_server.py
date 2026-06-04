"""
Minimal static-file server that mimics GitHub Pages' URL behaviour.

Unlike Python's stdlib http.server, this serves ``index.html`` for the
root path (matching GitHub Pages) and returns proper 404s for missing
files. Used by ``tests/ghpages.test.ts`` to verify the production
build at a ``/<repo>/`` subpath works exactly as it would on
``https://<user>.github.io/<repo>/``.

Configuration via env:
  GH_PAGES_PORT  — port to listen on (default 18765)
  GH_PAGES_REPO  — repo subpath, e.g. "ClimateShield" (default "")
  GH_PAGES_ROOT  — directory to serve (default "dist")

Not for production use.
"""
from __future__ import annotations

import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional


class GitHubPagesHandler(BaseHTTPRequestHandler):
    root: Path = Path("dist")
    repo_subpath: str = ""

    def log_message(self, format, *args):  # noqa: A002
        # Quiet by default — pytest captures stderr.
        pass

    def _resolve(self, path: str) -> Optional[Path]:
        """Resolve ``/<repo><path>`` to a local file under ``self.root``."""
        if self.repo_subpath and path.startswith(f"/{self.repo_subpath}"):
            path = path[len(self.repo_subpath) + 1 :]
        if not path.startswith("/"):
            path = "/" + path
        clean = (self.root / path.lstrip("/")).resolve()
        try:
            clean.relative_to(self.root.resolve())
        except ValueError:
            return None
        if clean.is_dir():
            clean = clean / "index.html"
        return clean if clean.is_file() else None

    def do_GET(self):  # noqa: N802
        if self.path == "/_healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        file = self._resolve(self.path)
        if file is None:
            self.send_error(404, f"File not found: {self.path}")
            return
        ctype, _ = mimetypes.guess_type(str(file))
        if ctype is None:
            ctype = "application/octet-stream"
        body = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    port = int(os.environ.get("GH_PAGES_PORT", "18765"))
    repo = os.environ.get("GH_PAGES_REPO", "")
    root = Path(os.environ.get("GH_PAGES_ROOT", "dist"))
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 1
    GitHubPagesHandler.root = root
    GitHubPagesHandler.repo_subpath = repo
    server = ThreadingHTTPServer(("127.0.0.1", port), GitHubPagesHandler)
    print(f"ghpages server: root={root} repo={repo!r} port={port}", file=sys.stderr)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
