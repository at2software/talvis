"""
TALVIS Timetracker
Minimal Windows GUI for tracking time against TALVIS projects and companies.
"""

import json
import os
import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, simpledialog, ttk

from api import TalvisAPI, TalvisAPIError

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

# ── Colours ──────────────────────────────────────────────────────────────────
BG         = "#1e1e2e"
BG_CARD    = "#2a2a3e"
BG_ACTIVE  = "#3a3a5e"
FG         = "#cdd6f4"
FG_DIM     = "#6c7086"
ACCENT     = "#89b4fa"
ACCENT_ACT = "#a6e3a1"
DANGER     = "#f38ba8"
FONT       = ("Segoe UI", 10)
FONT_SM    = ("Segoe UI", 9)
FONT_LG    = ("Segoe UI", 13, "bold")


# ── Settings ─────────────────────────────────────────────────────────────────
def load_settings() -> dict:
    defaults = {"api_url": "http://localhost:8000/api", "token": "", "remember_token": True}
    try:
        with open(SETTINGS_FILE, "r") as f:
            data = json.load(f)
            return {**defaults, **data}
    except Exception:
        return defaults


def save_settings(settings: dict):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)


# ── Helpers ───────────────────────────────────────────────────────────────────
def fmt_elapsed(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    return f"{m:02d}m {s:02d}s"


def fmt_hours(hours: float) -> str:
    total_s = int(hours * 3600)
    return fmt_elapsed(total_s)


# ── App ───────────────────────────────────────────────────────────────────────
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("TALVIS Timetracker")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.geometry("420x520")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self.settings = load_settings()
        self.api = TalvisAPI(self.settings["api_url"], self.settings.get("token", ""))

        # tracking state
        self.active_target: dict | None = None
        self.track_start:   datetime | None = None
        self._timer_id = None

        self._frame: tk.Frame | None = None
        self._show_login()

    # ── Frame switching ───────────────────────────────────────────────────────
    def _switch(self, frame: tk.Frame):
        if self._frame:
            self._frame.destroy()
        self._frame = frame
        frame.pack(fill="both", expand=True)

    # ── Login screen ──────────────────────────────────────────────────────────
    def _show_login(self):
        self.geometry("380x300")
        f = tk.Frame(self, bg=BG)

        tk.Label(f, text="TALVIS Timetracker", font=FONT_LG, bg=BG, fg=ACCENT).pack(pady=(40, 4))
        tk.Label(f, text="Sign in with your TALVIS credentials", font=FONT_SM, bg=BG, fg=FG_DIM).pack(pady=(0, 24))

        form = tk.Frame(f, bg=BG)
        form.pack(padx=40, fill="x")

        tk.Label(form, text="Email", font=FONT_SM, bg=BG, fg=FG_DIM, anchor="w").pack(fill="x")
        email_var = tk.StringVar()
        email_entry = tk.Entry(form, textvariable=email_var, font=FONT, bg=BG_CARD, fg=FG,
                               insertbackground=FG, relief="flat", bd=6)
        email_entry.pack(fill="x", pady=(2, 10))

        tk.Label(form, text="Password", font=FONT_SM, bg=BG, fg=FG_DIM, anchor="w").pack(fill="x")
        pw_var = tk.StringVar()
        pw_entry = tk.Entry(form, textvariable=pw_var, show="•", font=FONT, bg=BG_CARD, fg=FG,
                            insertbackground=FG, relief="flat", bd=6)
        pw_entry.pack(fill="x", pady=(2, 16))

        status_var = tk.StringVar()
        status_lbl = tk.Label(form, textvariable=status_var, font=FONT_SM, bg=BG, fg=DANGER, anchor="w")
        status_lbl.pack(fill="x")

        btn = tk.Button(form, text="Login", font=FONT, bg=ACCENT, fg="#1e1e2e",
                        activebackground=ACCENT, relief="flat", bd=0, pady=8,
                        command=lambda: _do_login())
        btn.pack(fill="x", pady=(8, 0))

        def _do_login():
            email = email_var.get().strip()
            pw    = pw_var.get()
            if not email or not pw:
                status_var.set("Please enter email and password.")
                return
            btn.config(state="disabled", text="Signing in…")
            status_var.set("")

            def _thread():
                try:
                    self.api.base_url = self.settings["api_url"]
                    self.api.login(email, pw)
                    if self.settings["remember_token"]:
                        self.settings["token"] = self.api.token
                        save_settings(self.settings)
                    self.after(0, self._show_main)
                except TalvisAPIError as e:
                    msg = "Invalid credentials." if e.status_code == 403 else f"Error {e.status_code}: {e}"
                    self.after(0, lambda: (status_var.set(msg), btn.config(state="normal", text="Login")))
                except Exception as e:
                    self.after(0, lambda: (status_var.set(f"Connection error: {e}"),
                                           btn.config(state="normal", text="Login")))

            threading.Thread(target=_thread, daemon=True).start()

        pw_entry.bind("<Return>", lambda _: _do_login())
        email_entry.bind("<Return>", lambda _: pw_entry.focus())
        email_entry.focus()
        self._switch(f)

    # ── Main screen ───────────────────────────────────────────────────────────
    def _show_main(self):
        self.geometry("420x520")
        f = tk.Frame(self, bg=BG)

        # ── Header ──
        header = tk.Frame(f, bg=BG)
        header.pack(fill="x", padx=12, pady=(12, 6))

        tk.Label(header, text="Timetracker", font=FONT_LG, bg=BG, fg=ACCENT).pack(side="left")

        btn_frame = tk.Frame(header, bg=BG)
        btn_frame.pack(side="right")

        tk.Button(btn_frame, text="⚙", font=FONT, bg=BG, fg=FG_DIM, relief="flat",
                  activebackground=BG, bd=0, command=self._open_settings).pack(side="right", padx=(4, 0))
        tk.Button(btn_frame, text="↻", font=FONT, bg=BG, fg=FG_DIM, relief="flat",
                  activebackground=BG, bd=0, command=self._reload_targets).pack(side="right")

        # ── Active bar ──
        self._active_frame = tk.Frame(f, bg=BG_ACTIVE)
        self._active_lbl   = tk.Label(self._active_frame, text="", font=FONT_SM, bg=BG_ACTIVE, fg=ACCENT_ACT)
        self._active_lbl.pack(side="left", padx=12, pady=6)
        self._elapsed_lbl  = tk.Label(self._active_frame, text="", font=("Segoe UI", 10, "bold"),
                                      bg=BG_ACTIVE, fg=ACCENT_ACT)
        self._elapsed_lbl.pack(side="right", padx=12, pady=6)

        # ── List ──
        list_frame = tk.Frame(f, bg=BG)
        list_frame.pack(fill="both", expand=True, padx=12, pady=(4, 12))

        scrollbar = tk.Scrollbar(list_frame, orient="vertical", bg=BG)
        self._canvas = tk.Canvas(list_frame, bg=BG, highlightthickness=0, yscrollcommand=scrollbar.set)
        scrollbar.config(command=self._canvas.yview)
        scrollbar.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)

        self._list_inner = tk.Frame(self._canvas, bg=BG)
        self._canvas_window = self._canvas.create_window((0, 0), window=self._list_inner, anchor="nw")

        self._list_inner.bind("<Configure>", lambda e: self._canvas.configure(
            scrollregion=self._canvas.bbox("all")))
        self._canvas.bind("<Configure>", lambda e: self._canvas.itemconfig(
            self._canvas_window, width=e.width))
        self._canvas.bind_all("<MouseWheel>",
                              lambda e: self._canvas.yview_scroll(-1 * (e.delta // 120), "units"))

        # ── Status bar ──
        self._status_var = tk.StringVar(value="Loading…")
        tk.Label(f, textvariable=self._status_var, font=FONT_SM, bg=BG, fg=FG_DIM, anchor="w"
                 ).pack(fill="x", padx=14, pady=(0, 6))

        self._switch(f)
        self._reload_targets()
        self._tick()

    # ── Target list ──────────────────────────────────────────────────────────
    def _reload_targets(self):
        self._status_var.set("Refreshing…")
        for w in self._list_inner.winfo_children():
            w.destroy()

        def _thread():
            try:
                targets = self.api.get_targets()
                self.after(0, lambda: self._render_targets(targets))
            except TalvisAPIError as e:
                if e.status_code in (401, 403):
                    self.after(0, lambda: (self._stop_timer(),
                                           messagebox.showerror("Session expired", "Please log in again."),
                                           self._show_login()))
                else:
                    self.after(0, lambda: self._status_var.set(f"Error: {e}"))
            except Exception as e:
                self.after(0, lambda: self._status_var.set(f"Connection error: {e}"))

        threading.Thread(target=_thread, daemon=True).start()

    def _render_targets(self, targets: list):
        subscribed = [t for t in targets if t.get("is_subscribed")]
        subscribed.sort(key=lambda t: t.get("name", "").lower())

        for w in self._list_inner.winfo_children():
            w.destroy()

        if not subscribed:
            tk.Label(self._list_inner, text="No subscribed projects or companies.",
                     font=FONT_SM, bg=BG, fg=FG_DIM).pack(pady=20)
            self._status_var.set("0 items")
            return

        for target in subscribed:
            self._make_row(target)

        n = len(subscribed)
        self._status_var.set(f"{n} item{'s' if n != 1 else ''}")

    def _make_row(self, target: dict):
        is_active = (self.active_target is not None and
                     self.active_target.get("id") == target.get("id") and
                     self.active_target.get("target") == target.get("target"))

        color  = target.get("color") or ACCENT
        name   = target.get("name") or "Unnamed"
        cat    = target.get("company_name") or ""
        bg     = BG_ACTIVE if is_active else BG_CARD

        row = tk.Frame(self._list_inner, bg=bg, cursor="hand2")
        row.pack(fill="x", pady=2)

        # colour strip
        tk.Frame(row, bg=color, width=4).pack(side="left", fill="y")

        inner = tk.Frame(row, bg=bg)
        inner.pack(side="left", fill="both", expand=True, padx=10, pady=8)

        tk.Label(inner, text=name, font=FONT, bg=bg, fg=FG, anchor="w").pack(fill="x")
        if cat:
            tk.Label(inner, text=cat, font=FONT_SM, bg=bg, fg=FG_DIM, anchor="w").pack(fill="x")

        indicator = tk.Label(row, text="●" if is_active else "", font=FONT_SM,
                             bg=bg, fg=ACCENT_ACT, padx=10)
        indicator.pack(side="right")

        def _click(t=target):
            self._toggle(t)

        for widget in (row, inner) + tuple(inner.winfo_children()) + (indicator,):
            widget.bind("<Button-1>", lambda e, t=target: _click(t))
            widget.bind("<Enter>", lambda e, r=row, b=bg: r.config(bg=b) or None)

    # ── Toggle tracking ───────────────────────────────────────────────────────
    def _toggle(self, target: dict):
        if self.active_target is not None:
            same = (self.active_target.get("id") == target.get("id") and
                    self.active_target.get("target") == target.get("target"))
            self._stop_tracking(switch_to=None if same else target)
        else:
            self._start_tracking(target)

    def _start_tracking(self, target: dict):
        self.active_target = target
        self.track_start   = datetime.now()
        self._status_var.set(f"Tracking: {target.get('name')}")
        self._active_frame.pack(fill="x", padx=12, pady=(0, 4))
        self._active_lbl.config(text=target.get("name", ""))
        self._reload_targets()

        def _thread():
            try:
                self.api.set_current_focus(target)
            except Exception:
                pass

        threading.Thread(target=_thread, daemon=True).start()

    def _stop_tracking(self, switch_to: dict | None = None):
        if not self.active_target or not self.track_start:
            return

        ended    = datetime.now()
        duration = (ended - self.track_start).total_seconds() / 3600
        target   = self.active_target
        started  = self.track_start

        self.active_target = None
        self.track_start   = None
        self._active_frame.pack_forget()

        def _thread():
            try:
                if duration >= (1 / 3600):  # at least 1 second
                    self.api.store_focus(target, started, duration)
                self.api.set_current_focus(switch_to)
            except Exception:
                pass
            if switch_to:
                self.after(0, lambda: self._start_tracking(switch_to))
            else:
                self.after(0, self._reload_targets)

        threading.Thread(target=_thread, daemon=True).start()

    # ── Timer tick ────────────────────────────────────────────────────────────
    def _tick(self):
        if self.active_target and self.track_start:
            elapsed = (datetime.now() - self.track_start).total_seconds()
            self._elapsed_lbl.config(text=fmt_elapsed(elapsed))
        self._timer_id = self.after(1000, self._tick)

    def _stop_timer(self):
        if self._timer_id:
            self.after_cancel(self._timer_id)
            self._timer_id = None

    # ── Settings dialog ───────────────────────────────────────────────────────
    def _open_settings(self):
        dlg = tk.Toplevel(self)
        dlg.title("Settings")
        dlg.configure(bg=BG)
        dlg.resizable(False, False)
        dlg.geometry("340x220")
        dlg.transient(self)
        dlg.grab_set()

        f = tk.Frame(dlg, bg=BG)
        f.pack(fill="both", expand=True, padx=20, pady=16)

        tk.Label(f, text="API URL", font=FONT_SM, bg=BG, fg=FG_DIM, anchor="w").pack(fill="x")
        url_var = tk.StringVar(value=self.settings.get("api_url", ""))
        tk.Entry(f, textvariable=url_var, font=FONT, bg=BG_CARD, fg=FG,
                 insertbackground=FG, relief="flat", bd=6).pack(fill="x", pady=(2, 14))

        remember_var = tk.BooleanVar(value=self.settings.get("remember_token", True))
        tk.Checkbutton(f, text="Remember token between sessions", variable=remember_var,
                       font=FONT_SM, bg=BG, fg=FG, selectcolor=BG_CARD,
                       activebackground=BG, activeforeground=FG).pack(anchor="w", pady=(0, 14))

        btn_row = tk.Frame(f, bg=BG)
        btn_row.pack(fill="x")

        def _save():
            self.settings["api_url"]        = url_var.get().strip().rstrip("/")
            self.settings["remember_token"] = remember_var.get()
            if not remember_var.get():
                self.settings["token"] = ""
            self.api.base_url = self.settings["api_url"]
            save_settings(self.settings)
            dlg.destroy()

        def _logout():
            self.settings["token"] = ""
            save_settings(self.settings)
            self.api.token = ""
            dlg.destroy()
            self._stop_timer()
            if self.active_target:
                self._stop_tracking()
            self._show_login()

        tk.Button(btn_row, text="Save", font=FONT, bg=ACCENT, fg="#1e1e2e",
                  relief="flat", bd=0, pady=6, command=_save).pack(side="left", expand=True, fill="x", padx=(0, 6))
        tk.Button(btn_row, text="Logout", font=FONT, bg=DANGER, fg="#1e1e2e",
                  relief="flat", bd=0, pady=6, command=_logout).pack(side="left", expand=True, fill="x")

    # ── Close ─────────────────────────────────────────────────────────────────
    def _on_close(self):
        if self.active_target:
            if messagebox.askyesno("Tracking active",
                                   f"You are tracking '{self.active_target.get('name')}'.\n"
                                   "Stop and record this session before quitting?"):
                self._stop_tracking()
        self._stop_timer()
        self.destroy()


if __name__ == "__main__":
    # Try silent auto-login with saved token
    app = App()
    settings = app.settings
    if settings.get("token") and settings.get("remember_token"):
        app.api.token = settings["token"]

        def _try_autologin():
            try:
                app.api.get_targets()  # just validates the token
                app.after(0, app._show_main)
            except Exception:
                app.settings["token"] = ""
                save_settings(app.settings)

        threading.Thread(target=_try_autologin, daemon=True).start()

    app.mainloop()
