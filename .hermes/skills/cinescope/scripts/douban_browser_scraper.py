#!/usr/bin/env python3
"""Compatibility wrapper; canonical implementation lives in CineScope."""

import runpy
from pathlib import Path

TARGET = Path.home() / "Documents" / "Project" / "CineScope" / "scripts" / "automation" / "douban_browser_scraper.py"
runpy.run_path(str(TARGET), run_name="__main__")
