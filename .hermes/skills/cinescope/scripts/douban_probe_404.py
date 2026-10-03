#!/usr/bin/env python3
"""Compatibility module; canonical implementation lives in CineScope."""

import importlib.util
from pathlib import Path

TARGET = Path.home() / "Documents" / "Project" / "CineScope" / "scripts" / "automation" / "douban_probe_404.py"
SPEC = importlib.util.spec_from_file_location("cinescope_douban_probe", TARGET)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

probe_missing_ids = MODULE.probe_missing_ids
delete_ids_from_json = MODULE.delete_ids_from_json
get_missing_ids_from_json = MODULE.get_missing_ids_from_json

if __name__ == "__main__":
    MODULE.main()
