# CELL-4B heart-rate bridge

This bridge turns the CELL-4B Raspberry Pi 4B and its MAX3010x fingertip sensor into the heart-rate source for Rogs Arena.
- **What the app does with it:** your real pulse shows next to your name. It is written on-chain with `report_heart`, which feeds the Calm pulse card (under 120 bpm) and the Steal Heart badge.
- **Nothing is simulated:** the bpm comes from your fingertip or not at all.

## Where the reading comes from

- **Measurement:** the pulse is measured and validated by CELL-4B's own `cell4b.pulse`.
  - It reads the MAX3010x FIFO at 100 Hz and takes an FFT over a sliding 15 s window, analysed every 2 s.
  - It checks confidence ≥ 0.5, 40–200 bpm, and perfusion between 0.05% and 8%.
- **When a value is used:** only when the analysis says a pulse is present. With no finger, or a moving one, the app gets no bpm.
- **Resolution:** with a 15 s window the reading moves in 4 bpm steps.

## Two ways to connect

| Mode | Command on the Pi | Rogs Arena side |
|---|---|---|
| **Wi-Fi** (works on this Pi) | `.venv/bin/python -u rogs_heart_bridge.py --http 8765` | Set `NEXT_PUBLIC_PULSE_BRIDGE_URL=http://<pi-ip>:8765` in `apps/web/.env.local`, rebuild, restart |
| **Bluetooth LE** | `.venv/bin/python -u rogs_heart_bridge.py` | No config; click Wearable and pick "CELL-4B Pulse" in Chrome's picker |
| **Sensor check** | `.venv/bin/python -u rogs_heart_bridge.py --check` | Prints each reading and whether it would be sent |

- **Why Wi-Fi:** on the CELL-4B Pi (kernel 6.18, BlueZ 5.82), Bluetooth mode powers the adapter and registers the Heart Rate service. But the kernel rejects every advertisement ("Failed to add advertisement: Invalid Parameters", including `bluetoothctl`'s own), so browsers cannot see it.
- **What Wi-Fi mode serves:** `GET /pulse` returns JSON like `{"bpm": 72, "present": true, "confidence": 0.82, "perfusion": 1.9, "reason": "", "at": 1789295150431}`, with `bpm` null unless present.
  - It answers CORS and Chrome's Private Network Access preflight for `--allow-origin` (default `http://localhost:3000`).
- **Freshness:** the web app polls every second. It treats a reading whose `at` stops changing for 10 s as stale, so the Pi's clock does not need to match the Mac's.
- **When Rogs Arena uses it:** the Wi-Fi source replaces Web Bluetooth only when the env var is set. The island, the WebSocket heart frames and `report_heart` are the same for both.

## Start it on the Pi

Run from the CELL-4B deploy directory, so `cell4b` imports:

```bash
scp tools/cell4b-heart-bridge/rogs_heart_bridge.py raspberrypi@192.168.1.22:Desktop/cell-4b/
ssh raspberrypi@192.168.1.22 'cd ~/Desktop/cell-4b && B=rogs_heart; nohup setsid .venv/bin/python -u ${B}_bridge.py --http 8765 > ~/${B}-bridge.log 2>&1 < /dev/null &'
curl http://192.168.1.22:8765/pulse
```

- **Log:** `~/rogs_heart-bridge.log` on the Pi, one line per analysis.
- **Why `${B}` in the command:** `pkill -f` matches against the remote shell's own command line, so the script's full name must not appear in it.
- **Dependencies:** it uses the venv's apt-provided `dbus-python` and PyGObject (Bluetooth mode only). Nothing to pip-install.
- **If Bluetooth is off:** Bluetooth mode needs the radio unblocked (`/usr/sbin/rfkill unblock bluetooth`, no sudo needed on this Pi).

## In the browser

1. Open `http://localhost:3000` and connect a wallet or play as guest.
2. Open the island's wearable pane and click **Connect wearable**. With Wi-Fi mode it reads "CELL-4B pulse sensor over Wi-Fi".
3. Keep a still fingertip on the sensor. The first bpm appears after about 8 s.
