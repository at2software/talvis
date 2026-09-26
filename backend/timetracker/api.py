import requests
from datetime import datetime, timezone


class TalvisAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


class TalvisAPI:
    def __init__(self, base_url: str, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _raise_for(self, resp: requests.Response):
        if not resp.ok:
            raise TalvisAPIError(resp.status_code, resp.text or f"HTTP {resp.status_code}")

    def login(self, email: str, password: str) -> dict:
        """POST /login — returns environment dict; sets self.token on success."""
        resp = requests.post(
            f"{self.base_url}/login",
            json={"email": email, "password": password},
            headers=self._headers(),
            timeout=10,
        )
        self._raise_for(resp)
        data = resp.json()
        # token lives inside data["user"]["api_token"]
        self.token = data.get("user", {}).get("api_token", "")
        return data

    def get_targets(self) -> list:
        """GET /timetracker — full list; caller filters to is_subscribed."""
        resp = requests.get(
            f"{self.base_url}/timetracker",
            headers=self._headers(),
            timeout=10,
        )
        self._raise_for(resp)
        return resp.json()

    def set_current_focus(self, target: dict | None):
        """PUT /timetracker/current_focus — pass target dict or None to clear."""
        payload = {}
        if target:
            key = target.get("target")  # "project_id" or "company_id"
            if key:
                payload[key] = target["id"]
        resp = requests.put(
            f"{self.base_url}/timetracker/current_focus",
            json=payload,
            headers=self._headers(),
            timeout=10,
        )
        self._raise_for(resp)
        return resp.json()

    def store_focus(self, target: dict, started_at: datetime, duration_hours: float,
                    comment: str = ""):
        """POST /timetracker — record a completed time entry."""
        payload = {
            "started_at": started_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
            "duration": round(duration_hours, 4),
        }
        key = target.get("target")
        if key:
            payload[key] = target["id"]
        if comment:
            payload["comment"] = comment
        resp = requests.post(
            f"{self.base_url}/timetracker",
            json=payload,
            headers=self._headers(),
            timeout=10,
        )
        self._raise_for(resp)
        return resp.json()
