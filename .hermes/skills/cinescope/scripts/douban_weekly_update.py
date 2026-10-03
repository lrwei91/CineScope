#!/usr/bin/env python3
"""Compatibility wrapper; canonical implementation lives in CineScope."""

import os
import subprocess
import sys
from pathlib import Path

RUNNER = Path.home() / "Documents" / "Project" / "CineScope" / "scripts" / "automation" / "run_update.py"
command = [sys.executable, str(RUNNER), "--task", "douban-cache"]
if "--dry-run" in sys.argv:
    command.append("--dry-run")
else:
    command.append("--publish")
env = os.environ.copy()
env["CINESCOPE_NODE_USE_ENV_PROXY"] = "1"
raise SystemExit(subprocess.run(command, env=env).returncode)
