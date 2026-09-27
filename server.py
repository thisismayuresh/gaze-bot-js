#!/usr/bin/env python3
"""
Tiny static file server for this project -- no dependencies beyond the
Python standard library.

Why this exists: browsers only allow camera access (getUserMedia) on
"secure contexts", which means https:// or http://localhost. Opening
index.html directly from disk (file://) will NOT work. Run this instead:

    python3 server.py

Then open the printed URL (defaults to http://localhost:8000) in your
browser.
"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Avoid the browser caching the JS/HTML while you're editing it.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving Gaze Bot at http://localhost:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")

if __name__ == "__main__":
    main()
