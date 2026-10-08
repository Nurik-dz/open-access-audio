"""Tests for the optional FastAPI layer (uvicorn audio_engine:app)."""
import os

import pytest

fastapi = pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

import audio_engine as engine  # noqa: E402


@pytest.fixture
def client():
    assert engine.app is not None, "FastAPI is installed, so the app must exist when imported as a module"
    return TestClient(engine.app)


def test_sfx_returns_wav_and_cleans_up(client, isolated_temp_dir):
    res = client.post("/api/sfx", json={"prompt": "door knock", "duration": 1.0})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.content[:4] == b"RIFF"
    assert os.listdir(isolated_temp_dir) == [], "background task must delete the output after sending"


def test_ambient_returns_wav(client):
    res = client.post("/api/ambient", json={"prompt": "rain", "seconds_total": 1.0})
    assert res.status_code == 200 and res.content[:4] == b"RIFF"


def test_blank_prompt_is_rejected(client):
    assert client.post("/api/sfx", json={"prompt": "   "}).status_code == 400
    assert client.post("/api/ambient", json={"prompt": ""}).status_code == 400


def test_image_endpoint_reuses_validated_fetch(client, monkeypatch):
    class Resp:
        content = b"\xff\xd8jpeg"
        headers = {"Content-Type": "image/jpeg"}

        def raise_for_status(self):
            pass

    monkeypatch.setattr(engine.requests, "get", lambda url, timeout: Resp())
    res = client.post("/api/image", json={"prompt": "cat"})
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg"


def test_image_upstream_failure_is_a_500_with_no_leftovers(client, monkeypatch, isolated_temp_dir):
    def boom(url, timeout):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(engine.requests, "get", boom)
    res = client.post("/api/image", json={"prompt": "cat"})
    assert res.status_code == 500 and "upstream down" in res.json()["detail"]
    assert os.listdir(isolated_temp_dir) == []
