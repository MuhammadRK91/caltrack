#!/usr/bin/env python3
"""Block credentials from reaching the remote.

    python scripts/secret-scan.py              # working tree (what CI runs)
    python scripts/secret-scan.py --staged     # staged changes (what the hook runs)
    python scripts/secret-scan.py --history    # every commit, for auditing an old repo

Exit status is 1 when anything is found, so it works as a hook and as a CI gate.

False positives go in .secretsallow, one substring per line. Prefer allowlisting the
specific value over loosening a pattern — a pattern protects every future commit,
an allowlist entry only excuses one known string.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("JWT / Supabase key",   re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("OpenAI key",           re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}")),
    ("Anthropic key",        re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("ElevenLabs / Stripe",  re.compile(r"\bsk_(?:live_|test_)?[A-Za-z0-9]{32,}")),
    ("Cal.com key",          re.compile(r"cal_(?:live|test)_[A-Za-z0-9]{16,}")),
    ("GitHub token",         re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("Google API key",       re.compile(r"AIza[0-9A-Za-z_-]{30,}")),
    ("Slack token",          re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("AWS access key",       re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private key block",    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----")),
    ("secret in query string", re.compile(r"[?&](?:access_?token|api_?key|auth|token|secret|password|signature)=(?!YOUR_|\{\{|\$)[A-Za-z0-9%._~+/-]{12,}", re.IGNORECASE)),
    ("assigned secret",      re.compile(r"(?:api_?key|access_?token|auth_?token|client_?secret|password|passwd|secret_?key)\s*[:=]\s*[\"'](?!YOUR_|\{\{|\$|\s*[\"'])[^\"'\s]{12,}[\"']", re.IGNORECASE)),
    ("long hex secret",      re.compile(r"\b[0-9a-f]{40,}\b")),
]

# Committing an env file is a mistake regardless of what is inside it.
BANNED_PATHS = re.compile(r"(?:^|/)\.env(?:\.[A-Za-z0-9_-]+)?$|\.pem$|\.p12$|\.pfx$|(?:^|/)id_(?:rsa|ed25519)$")
ALLOWED_PATHS = re.compile(r"(?:^|/)\.env\.example$|(?:^|/)\.env\.sample$")

# Binaries and lockfiles are noise: hashes everywhere, no hand-written secrets.
SKIP = re.compile(
    r"\.(?:png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tgz|jar|woff2?|ttf|eot|mp[34]|mov|wasm)$"
    r"|(?:^|/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Gemfile\.lock)$"
    r"|(?:^|/)(?:node_modules|\.git|dist|build|\.venv|venv|__pycache__)/",
    re.IGNORECASE,
)


def git(*args: str) -> str:
    # encoding must be explicit: on Windows the default is cp1252, which raises on
    # any byte outside that codepage — and a crash while reading a file would be
    # indistinguishable from a finding. Never let a read error become a verdict.
    proc = subprocess.run(["git", *args], capture_output=True,
                          encoding="utf-8", errors="replace")
    return proc.stdout or ""


def allowlist() -> list[str]:
    p = Path(".secretsallow")
    if not p.exists():
        return []
    return [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.startswith("#")]


def scan_text(path: str, text: str, allowed: list[str]) -> list[str]:
    out = []
    for lineno, line in enumerate(text.splitlines(), 1):
        if len(line) > 8000:
            line = line[:8000]
        for label, pattern in PATTERNS:
            for m in pattern.finditer(line):
                hit = m.group(0)
                if any(a in hit for a in allowed):
                    continue
                shown = hit if len(hit) <= 48 else hit[:24] + "…" + hit[-8:]
                out.append(f"{path}:{lineno}  {label}: {shown}")
    return out


def check_paths(paths: list[str]) -> list[str]:
    return [f"{p}  banned file — env files and private keys must never be committed"
            for p in paths if BANNED_PATHS.search(p) and not ALLOWED_PATHS.search(p)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--staged", action="store_true")
    ap.add_argument("--history", action="store_true")
    args = ap.parse_args()

    allowed = allowlist()
    findings: list[str] = []

    if args.history:
        commits = git("rev-list", "--all").split()
        print(f"scanning {len(commits)} commits …")
        seen: set[str] = set()
        for c in commits:
            for line in git("grep", "-I", "-n", "-E",
                            "|".join(p.pattern for _, p in PATTERNS), c).splitlines():
                if line and not any(a in line for a in allowed) and line not in seen:
                    seen.add(line)
                    findings.append(line[:160])
    else:
        if args.staged:
            paths = [p for p in git("diff", "--cached", "--name-only", "--diff-filter=ACM").splitlines() if p]
            reader = lambda p: git("show", f":{p}")
        else:
            paths = [p for p in git("ls-files").splitlines() if p]
            reader = lambda p: Path(p).read_text(encoding="utf-8", errors="replace")

        findings += check_paths(paths)
        unreadable = []
        for p in paths:
            if SKIP.search(p):
                continue
            try:
                text = reader(p)
            except (OSError, UnicodeDecodeError) as exc:
                unreadable.append(f"{p}: {exc}")
                continue
            if text:
                findings += scan_text(p, text, allowed)
            elif Path(p).exists() and Path(p).stat().st_size > 0:
                # Genuinely empty files are fine. A non-empty file that read as
                # nothing means the read failed, which is worth saying out loud.
                unreadable.append(f"{p}: read returned nothing")

        # Surfaced rather than swallowed: a file the scanner could not read is a
        # file it did not check, and silence there is a false sense of safety.
        if unreadable:
            print(f"warning: {len(unreadable)} file(s) could not be scanned")
            for u in unreadable[:10]:
                print(f"  {u}")

    if findings:
        print("\nPOSSIBLE SECRETS — commit blocked\n")
        for f in findings[:60]:
            print(f"  {f}")
        if len(findings) > 60:
            print(f"  … and {len(findings) - 60} more")
        print("\nMove the value to an environment variable, or add it to .secretsallow"
              "\nif it is genuinely not a secret.")
        return 1

    print("secret scan: clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
