#!/usr/bin/env python3
"""CELL-4B heart-rate bridge for Rogs Arena.

Turns the Raspberry Pi 4B from the CELL-4B build into a standard Bluetooth LE heart-rate sensor. The fingertip pulse
is measured by the MAX3010x on I2C with CELL-4B's own tested reader and analysis (`cell4b.pulse`); this script only
publishes it through the Bluetooth SIG Heart Rate service (0x180D, measurement 0x2A37), the same profile a chest strap
uses. Rogs Arena needs no changes: click Wearable in Chrome, pick "CELL-4B Pulse", and the bpm goes live and on-chain.

Nothing is simulated. A value is sent only when `Pulse.present` holds (confidence >= 0.5, 40-200 bpm, perfusion
inside the blood-volume range). With no finger, or a moving one, the browser simply receives nothing.

Run from the CELL-4B deploy directory so `cell4b` imports (the venv has dbus-python and PyGObject from apt):
    cd ~/Desktop/cell-4b && .venv/bin/python -u rogs_heart_bridge.py --http 8765     # Wi-Fi: GET /pulse
    cd ~/Desktop/cell-4b && .venv/bin/python -u rogs_heart_bridge.py                 # Bluetooth LE sensor
    cd ~/Desktop/cell-4b && .venv/bin/python -u rogs_heart_bridge.py --check         # sensor only
On the CELL-4B Pi (kernel 6.18, BlueZ 5.82) the Bluetooth mode powers the adapter and registers the service, but the
kernel rejects every advertisement ("Failed to add advertisement: Invalid Parameters", bluetoothctl's own included),
so browsers cannot find it. The Wi-Fi mode serves the same validated readings to Rogs Arena over the LAN.
"""
from __future__ import annotations

import argparse
import collections
import json
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cell4b.pulse import SAMPLE_RATE, Max3010x, NoSensor, Pulse, analyse

DEVICE_NAME = "CELL-4B Pulse"
# FFT resolution is 1/window: 15 s gives 4 bpm steps. Analysis starts once 8 s are buffered, then every STEP_S.
WINDOW_S = 15.0
MIN_ANALYSIS_S = 8.0
STEP_S = 2.0

BLUEZ = "org.bluez"
DBUS_OM = "org.freedesktop.DBus.ObjectManager"
DBUS_PROP = "org.freedesktop.DBus.Properties"
ADAPTER_IFACE = "org.bluez.Adapter1"
GATT_MANAGER = "org.bluez.GattManager1"
ADV_MANAGER = "org.bluez.LEAdvertisingManager1"
SERVICE_IFACE = "org.bluez.GattService1"
CHRC_IFACE = "org.bluez.GattCharacteristic1"
ADV_IFACE = "org.bluez.LEAdvertisement1"

HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb"
BODY_SENSOR_LOCATION = "00002a38-0000-1000-8000-00805f9b34fb"
LOCATION_FINGER = 3
# Heart Rate Measurement flags: 8-bit bpm, sensor contact supported (bit 1) and detected (bit 2).
FLAGS_CONTACT_DETECTED = 0x06


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


class PulseReader(threading.Thread):
    """Reads the MAX3010x continuously and analyses a sliding window every STEP_S seconds."""

    def __init__(self, on_pulse):
        super().__init__(daemon=True)
        self.on_pulse = on_pulse
        self.window: collections.deque[int] = collections.deque(maxlen=int(WINDOW_S * SAMPLE_RATE))
        self.stopped = threading.Event()

    def run(self) -> None:
        while not self.stopped.is_set():
            try:
                sensor = Max3010x()
                sensor.configure()
                time.sleep(0.3)
                log(f"{sensor.name} ready on I2C 0x57; place a still fingertip on the sensor")
                self.window.clear()
                while not self.stopped.is_set():
                    _red, ir = sensor.collect(STEP_S)
                    if not ir:
                        raise RuntimeError("the sensor returned no samples")
                    self.window.extend(ir)
                    if len(self.window) >= MIN_ANALYSIS_S * SAMPLE_RATE:
                        self.on_pulse(analyse(list(self.window)))
            except NoSensor as error:
                log(f"no pulse sensor: {error}; retrying in 5 s")
                self.stopped.wait(5)
            except Exception as error:  # I2C glitches and brown-outs: reopen the sensor rather than exit
                log(f"sensor error {type(error).__name__}: {error}; reopening in 3 s")
                self.stopped.wait(3)


def describe(pulse: Pulse) -> str:
    return f"bpm {pulse.bpm:.0f} conf {pulse.confidence:.2f} perfusion {pulse.perfusion:.2f}"


def run_check() -> int:
    """Sensor only: prints what the bridge would send, without touching Bluetooth."""
    reader = PulseReader(lambda pulse: log(f"{describe(pulse)} -> {'PULSE PRESENT' if pulse.present else 'not sent: ' + (pulse.reason or 'not present')}"))
    reader.start()
    try:
        while reader.is_alive():
            reader.join(0.5)
    except KeyboardInterrupt:
        reader.stopped.set()
    return 0


def run_bluetooth(name: str) -> int:
    import dbus
    import dbus.exceptions
    import dbus.mainloop.glib
    import dbus.service
    from gi.repository import GLib

    class InvalidArgs(dbus.exceptions.DBusException):
        _dbus_error_name = "org.freedesktop.DBus.Error.InvalidArgs"

    class NotSupported(dbus.exceptions.DBusException):
        _dbus_error_name = "org.bluez.Error.NotSupported"

    base_path = "/org/rogs/cell4b"

    class Application(dbus.service.Object):
        def __init__(self, bus):
            self.path = base_path
            self.services = []
            super().__init__(bus, self.path)

        def get_path(self):
            return dbus.ObjectPath(self.path)

        @dbus.service.method(DBUS_OM, out_signature="a{oa{sa{sv}}}")
        def GetManagedObjects(self):
            objects = {}
            for service in self.services:
                objects[service.get_path()] = service.get_properties()
                for characteristic in service.characteristics:
                    objects[characteristic.get_path()] = characteristic.get_properties()
            return objects

    class Service(dbus.service.Object):
        def __init__(self, bus, index, uuid):
            self.path = f"{base_path}/service{index}"
            self.uuid = uuid
            self.characteristics = []
            super().__init__(bus, self.path)

        def get_path(self):
            return dbus.ObjectPath(self.path)

        def get_properties(self):
            paths = dbus.Array([c.get_path() for c in self.characteristics], signature="o")
            return {SERVICE_IFACE: {"UUID": self.uuid, "Primary": True, "Characteristics": paths}}

        @dbus.service.method(DBUS_PROP, in_signature="s", out_signature="a{sv}")
        def GetAll(self, interface):
            if interface != SERVICE_IFACE:
                raise InvalidArgs()
            return self.get_properties()[SERVICE_IFACE]

    class Characteristic(dbus.service.Object):
        def __init__(self, bus, index, uuid, flags, service):
            self.path = f"{service.path}/char{index}"
            self.uuid = uuid
            self.flags = flags
            self.service = service
            super().__init__(bus, self.path)

        def get_path(self):
            return dbus.ObjectPath(self.path)

        def get_properties(self):
            return {CHRC_IFACE: {"Service": self.service.get_path(), "UUID": self.uuid, "Flags": dbus.Array(self.flags, signature="s")}}

        @dbus.service.method(DBUS_PROP, in_signature="s", out_signature="a{sv}")
        def GetAll(self, interface):
            if interface != CHRC_IFACE:
                raise InvalidArgs()
            return self.get_properties()[CHRC_IFACE]

        @dbus.service.method(CHRC_IFACE, in_signature="a{sv}", out_signature="ay")
        def ReadValue(self, options):
            raise NotSupported()

        @dbus.service.method(CHRC_IFACE)
        def StartNotify(self):
            raise NotSupported()

        @dbus.service.method(CHRC_IFACE)
        def StopNotify(self):
            raise NotSupported()

        @dbus.service.signal(DBUS_PROP, signature="sa{sv}as")
        def PropertiesChanged(self, interface, changed, invalidated):
            pass

    class HeartRateMeasurement(Characteristic):
        def __init__(self, bus, index, service):
            super().__init__(bus, index, HR_MEASUREMENT, ["notify"], service)
            self.notifying = False

        def StartNotify(self):
            self.notifying = True
            log("a browser subscribed to heart rate")

        def StopNotify(self):
            self.notifying = False
            log("the browser unsubscribed")

        def publish(self, bpm: int) -> bool:
            if not self.notifying:
                return False
            value = dbus.Array([dbus.Byte(FLAGS_CONTACT_DETECTED), dbus.Byte(bpm)], signature="y")
            self.PropertiesChanged(CHRC_IFACE, {"Value": value}, [])
            return True

    class BodySensorLocation(Characteristic):
        def __init__(self, bus, index, service):
            super().__init__(bus, index, BODY_SENSOR_LOCATION, ["read"], service)

        def ReadValue(self, options):
            return dbus.Array([dbus.Byte(LOCATION_FINGER)], signature="y")

    class Advertisement(dbus.service.Object):
        def __init__(self, bus, index, properties):
            self.path = f"{base_path}/advertisement{index}"
            self.properties = properties
            super().__init__(bus, self.path)

        def get_path(self):
            return dbus.ObjectPath(self.path)

        @dbus.service.method(DBUS_PROP, in_signature="s", out_signature="a{sv}")
        def GetAll(self, interface):
            if interface != ADV_IFACE:
                raise InvalidArgs()
            return self.properties

        @dbus.service.method(ADV_IFACE)
        def Release(self):
            log("BlueZ released the advertisement")

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    loop = GLib.MainLoop()
    exit_code = {"value": 0}

    def fail(message: str) -> None:
        log(message)
        exit_code["value"] = 1
        loop.quit()

    managed = dbus.Interface(bus.get_object(BLUEZ, "/"), DBUS_OM).GetManagedObjects()
    adapter = next((path for path, interfaces in managed.items() if ADAPTER_IFACE in interfaces), None)
    if adapter is None:
        log("no Bluetooth adapter found (is bluetoothd running?)")
        return 1
    adapter_props = dbus.Interface(bus.get_object(BLUEZ, adapter), DBUS_PROP)
    try:
        if not adapter_props.Get(ADAPTER_IFACE, "Powered"):
            adapter_props.Set(ADAPTER_IFACE, "Powered", dbus.Boolean(True))
            time.sleep(1.0)
        adapter_props.Set(ADAPTER_IFACE, "Alias", dbus.String(name))
        # Discoverable with no timeout, so browsers can find the Pi while the bridge runs.
        adapter_props.Set(ADAPTER_IFACE, "DiscoverableTimeout", dbus.UInt32(0))
        adapter_props.Set(ADAPTER_IFACE, "Discoverable", dbus.Boolean(True))
    except dbus.exceptions.DBusException as error:
        log(f"could not power the Bluetooth adapter: {error.get_dbus_message()} (run with sudo; check `rfkill list`)")
        return 1
    log(f"Bluetooth adapter {adapter} powered, name {name}")

    app = Application(bus)
    service = Service(bus, 0, HR_SERVICE)
    measurement = HeartRateMeasurement(bus, 0, service)
    service.characteristics = [measurement, BodySensorLocation(bus, 1, service)]
    app.services = [service]

    gatt_manager = dbus.Interface(bus.get_object(BLUEZ, adapter), GATT_MANAGER)
    adv_manager = dbus.Interface(bus.get_object(BLUEZ, adapter), ADV_MANAGER)
    gatt_manager.RegisterApplication(
        app.get_path(), {},
        reply_handler=lambda: log("Heart Rate service (0x180D) registered with BlueZ"),
        error_handler=lambda error: fail(f"could not register the heart-rate service: {error}"),
    )

    # The Pi 4B controller rejected the first form tried ("Failed to add advertisement: Invalid Parameters"), and
    # which fields a controller and BlueZ build accept varies, so forms are tried from richest to simplest. The Heart
    # Rate UUID is in every form because Chrome's device picker filters on it.
    uuids = dbus.Array(["180d"], signature="s")
    variants = [
        ("service UUID and name", {"Type": "peripheral", "ServiceUUIDs": uuids, "LocalName": dbus.String(name)}),
        ("service UUID, name in scan response", {"Type": "peripheral", "ServiceUUIDs": uuids, "Includes": dbus.Array(["local-name"], signature="s")}),
        ("service UUID, discoverable, name", {"Type": "peripheral", "ServiceUUIDs": uuids, "Discoverable": dbus.Boolean(True), "LocalName": dbus.String(name)}),
        ("service UUID only", {"Type": "peripheral", "ServiceUUIDs": uuids}),
    ]
    active = {"advertisement": None}

    def advertise(index: int = 0) -> None:
        if index >= len(variants):
            fail("no advertisement form was accepted; see `journalctl -u bluetooth`")
            return
        label, properties = variants[index]
        advertisement = Advertisement(bus, index, properties)

        def registered():
            active["advertisement"] = advertisement
            log(f'advertising as "{name}" ({label}); in Rogs Arena click Wearable and pick it')

        def rejected(error):
            log(f"advertisement form '{label}' rejected: {error.get_dbus_message()}")
            advertisement.remove_from_connection()
            advertise(index + 1)

        adv_manager.RegisterAdvertisement(advertisement.get_path(), {}, reply_handler=registered, error_handler=rejected)

    advertise()

    def deliver(pulse: Pulse) -> bool:
        if pulse.present:
            bpm = max(40, min(200, int(round(pulse.bpm))))
            sent = measurement.publish(bpm)
            log(f"{describe(pulse)} -> {'sent to the browser' if sent else 'pulse present, no browser connected yet'}")
        else:
            log(f"{describe(pulse)} -> not sent: {pulse.reason or 'no pulse'}")
        return False  # run once per idle_add

    reader = PulseReader(lambda pulse: GLib.idle_add(deliver, pulse))
    reader.start()

    def stop(*_args) -> None:
        reader.stopped.set()
        if active["advertisement"] is not None:
            try:
                adv_manager.UnregisterAdvertisement(active["advertisement"].get_path())
            except dbus.exceptions.DBusException:
                pass
        loop.quit()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    loop.run()
    return exit_code["value"]


def run_http(port: int, allow_origin: str) -> int:
    """Serves the latest analysis as JSON at /pulse. `bpm` is null unless a pulse is present; `at` is when it was read."""
    latest: dict = {"bpm": None, "present": False, "confidence": 0.0, "perfusion": 0.0, "reason": "starting", "at": None}
    lock = threading.Lock()

    def record(pulse: Pulse) -> None:
        reading = {
            "bpm": max(40, min(200, int(round(pulse.bpm)))) if pulse.present else None,
            "present": pulse.present,
            "confidence": round(pulse.confidence, 3),
            "perfusion": round(pulse.perfusion, 3),
            "reason": pulse.reason,
            "at": int(time.time() * 1000),
        }
        with lock:
            latest.update(reading)
        outcome = f"serving {reading['bpm']} bpm" if pulse.present else f"no pulse: {pulse.reason or 'not present'}"
        log(f"{describe(pulse)} -> {outcome}")

    class Handler(BaseHTTPRequestHandler):
        def cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", allow_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            # Chrome's Private Network Access preflight, for a page reading a device on the LAN.
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Cache-Control", "no-store")

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self) -> None:
            if self.path.split("?")[0] != "/pulse":
                self.send_response(404)
                self.cors()
                self.end_headers()
                return
            with lock:
                body = json.dumps(latest).encode()
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args) -> None:
            pass  # one line per analysis is logged instead

    reader = PulseReader(record)
    reader.start()
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log(f"serving the pulse on port {port} at /pulse for {allow_origin}")
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown, daemon=True).start())
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        reader.stopped.set()
        server.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="read the sensor and print pulses without Bluetooth")
    parser.add_argument("--http", type=int, metavar="PORT", help="serve readings over Wi-Fi at http://<pi>:PORT/pulse")
    parser.add_argument("--allow-origin", default="http://localhost:3000", help="web app origin allowed to read /pulse")
    parser.add_argument("--name", default=DEVICE_NAME, help="Bluetooth name shown in the browser's device picker")
    args = parser.parse_args()
    if args.check:
        return run_check()
    if args.http:
        return run_http(args.http, args.allow_origin)
    return run_bluetooth(args.name)


if __name__ == "__main__":
    sys.exit(main())
