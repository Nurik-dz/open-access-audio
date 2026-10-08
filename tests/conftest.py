import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import audio_engine  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_temp_dir(tmp_path, monkeypatch):
    """Keep every test's scratch files out of the project's temp_audio/ directory."""
    monkeypatch.setattr(audio_engine, "TEMP_DIR", str(tmp_path))
    return tmp_path
