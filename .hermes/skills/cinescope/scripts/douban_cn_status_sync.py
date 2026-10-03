#!/usr/bin/env python3
"""Compatibility wrapper; canonical implementation lives in CineScope."""

import subprocess
import sys
from pathlib import Path

RUNNER = Path("/Users/lrwei91/Documents/Project/CineScope/scripts/automation/run_update.py")
command = [sys.executable, str(RUNNER), "--task", "tv-status"]
if "--dry-run" in sys.argv:
    command.append("--dry-run")
else:
    command.append("--publish")
raise SystemExit(subprocess.run(command).returncode)
