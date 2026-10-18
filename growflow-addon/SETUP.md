# Home Assistant Add-on Setup

The Home Assistant add-on is maintained in the main GrowFlow repository. No
separate add-on repository or cross-repository synchronization is required.

## Add the repository

1. Open **Settings → Add-ons → Add-on Store** in Home Assistant.
2. Open the **⋮** menu and choose **Repositories**.
3. Add:

   ```
   https://github.com/deng-leon/growflow
   ```
4. Refresh the store, select **GrowFlow Plant Tracker**, and click **Install**.
5. Start the add-on and open GrowFlow from the Home Assistant sidebar.

The add-on definition is under `growflow-addon/growflow/`. Its `data` mapping
keeps the SQLite database and uploaded images across restarts. Ingress is
enabled by default, so no host port mapping is required.

## Home Assistant connection and control

In Supervisor mode, the add-on receives `SUPERVISOR_TOKEN` and connects
through the Home Assistant Supervisor proxy automatically. A long-lived token
is only needed for standalone Docker, where `HA_URL` and `HA_TOKEN` must be
supplied as environment variables. `PORT` defaults to `8080` and is an
internal container port; Ingress is the normal add-on access path.

After installation, open an Area and bind sensor and actuator entities.
Configure temperature, humidity, VPD corridor, light schedule, and
ventilation/fan targets for each phase. The VPD chart plots the live reading
and supports a leaf-temperature offset (default `-2 °C`). Environment History
provides 1h, 6h, 24h, 7d, 30d, whole-grow, and custom charts for temperature,
humidity, and VPD, with controller and Area-event markers.

Use these exact controller and recorder variables:

```text
CONTROLLER_ENABLED=false
CONTROLLER_INTERVAL_MS=15000
CONTROLLER_STALE_AFTER_MS=600000
CONTROLLER_TIMEZONE=$TZ
RECORDER_ENABLED=true
RECORDER_INTERVAL_MS=60000
RETENTION_DAYS=180
```

Keep the controller disabled during setup, select the desired per-actuator
fail-safe (hold, off, or on), verify manual mode, and test with a dummy
switch before connecting real equipment.

## Building locally

The application image is built from the repository root. The add-on image is
then built using `growflow-addon/growflow/Dockerfile` and the selected
architecture's `BUILD_FROM` image. The included `build.yaml` documents the
Home Assistant architecture image mapping.
