# GrowFlow Home Assistant Add-on Repository

Home Assistant Add-on repository for the GrowFlow Plant Tracking Application.
The add-on definition lives in this repository alongside the application
source. See the main [GrowFlow documentation](https://github.com/grow-flow/growflow)
for application features and usage.

## Installation

1. Open **Settings → Add-ons → Add-on Store** in Home Assistant.
2. Open the **⋮** menu and choose **Repositories**.
3. Add:

   ```
   https://github.com/grow-flow/growflow
   ```

4. Refresh the store, select **GrowFlow Plant Tracker**, and click **Install**.

The add-on configuration is documented in
[growflow/README.md](growflow/README.md).

## Home Assistant control setup

Supervisor mode supplies `SUPERVISOR_TOKEN` to the add-on automatically, so a
long-lived token is not required. For standalone Docker, create a Home
Assistant long-lived access token and set `HA_URL` and `HA_TOKEN`; keep the
token private and server-side.

Ingress is enabled and is the recommended access path. The internal API/web
port is `8080`. `PORT` changes that internal port, but does not publish a host
port; standalone containers must publish it explicitly.

Open an Area to bind HA temperature, humidity, and optional VPD sensors plus
light, humidifier, dehumidifier, ventilation, and fan switches. Configure
per-phase temperature, humidity, VPD corridor, light, and fan targets. The
VPD chart plots the live reading and supports a leaf-temperature offset
(default `-2 °C`). Environment History provides selectable sensor charts and
action/event markers.

The controller is disabled by default. Configure
`CONTROLLER_ENABLED`, `CONTROLLER_INTERVAL_MS`,
`CONTROLLER_STALE_AFTER_MS`, `CONTROLLER_TIMEZONE`, `RECORDER_ENABLED`,
`RECORDER_INTERVAL_MS`, and `RETENTION_DAYS` before enabling automation. Keep
it disabled during setup, verify bindings and manual mode, choose a fail-safe
(hold, off, or on), and test with a dummy switch first.

## Repository layout

- `backend/` and `frontend/` contain the GrowFlow application.
- `growflow-addon/` contains the Home Assistant repository metadata and
  add-on definition.
- `growflow-addon/growflow/` contains the manifest, image Dockerfile, build
  configuration, and startup script.

## License

See the repository [LICENSE](https://github.com/grow-flow/growflow/blob/main/LICENSE).
