# GrowFlow Plant Tracker - Home Assistant Add-on

A comprehensive plant tracking system for documenting the complete grow process from germination to harvest.
[Growflow Project](https://github.com/grow-flow/growflow)

![GrowFlow Screenshot](https://raw.githubusercontent.com/grow-flow/growflow/main/assets/dashboard_view.png)

> ⚠️ This project is under active development. Features and interfaces may change.

## Installation

1. Navigate in your Home Assistant frontend to **Supervisor** → **Add-on Store**
2. Add this repository to your add-on store:
   ```
   https://github.com/deng-leon/growflow
   ```
3. Find "GrowFlow Plant Tracker" in the add-on store and click it
4. Click "Install" and wait for installation to complete

5. Start the add-on
6. Access via the **GrowFlow** panel in Home Assistant sidebar

## Home Assistant setup

The add-on runs in Supervisor mode and uses the supplied `SUPERVISOR_TOKEN`
automatically. No long-lived token is needed for this installation. Standalone
Docker users must create a Home Assistant long-lived access token and set
`HA_URL` and `HA_TOKEN`.

Ingress is enabled by default. `PORT` defaults to `8080` and is an internal
container port; standalone deployments must publish it explicitly.

In each Area, bind temperature, humidity, and optional VPD sensors, then bind
the light, humidifier, dehumidifier, ventilation, and fan switches. Configure
per-phase grow settings and the VPD corridor. The VPD chart plots the live
reading and supports a leaf-temperature offset (default `-2 °C`). History
charts cover temperature, humidity, and VPD with selectable timescales and
action/event markers.

The controller is disabled by default. Enable it with the **Controller enabled**
add-on option (`controller_enabled`) once entities, manual mode, and fail-safe
behavior are verified, and test with a dummy switch first. Other variables
(`CONTROLLER_INTERVAL_MS`, `CONTROLLER_STALE_AFTER_MS`, `CONTROLLER_TIMEZONE`,
`RECORDER_ENABLED`, `RECORDER_INTERVAL_MS`, `RETENTION_DAYS`) keep their
defaults in the add-on.

This is a fork of the upstream add-on and installs as a separate add-on (a new
repository means a new slug), so existing upstream data is not shared; the
upstream add-on can stay installed during migration.

## Support

For support and feature requests:

- **Add-on Issues**: [Create an issue](https://github.com/grow-flow/growflow/issues)
- **Application Issues**: [Main project issues](https://github.com/grow-flow/growflow/issues)
- **Documentation**: [Project Documentation](https://github.com/grow-flow/growflow)

## License

MIT License - see the [LICENSE](https://github.com/grow-flow/growflow/blob/main/LICENSE) file for details.

## Legal Notice

This software is designed for legal plant cultivation tracking and documentation purposes only. Users are responsible for compliance with local laws and regulations.
