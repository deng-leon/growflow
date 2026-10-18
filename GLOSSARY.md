# Glossary

- **Area**: a tent/room. The binding level for HA devices; owns plants.
- **Grow setting**: a target for an Area per phase (temperature, humidity, VPD ranges; light schedule; ventilation duty cycle; fan schedule). Extends existing phase targets; Area-level settings override them.
- **Sensor binding**: link from an Area to an HA sensor entity, with a role (temperature, humidity, ...).
- **Room climate**: one Home Assistant `climate.*` entity supplying `current_temperature` and, when supported, `current_humidity` for air drawn into an Area by ventilation. Legacy room sensor bindings remain a fallback.
- **Actuator binding**: link from an Area to an HA switch-like entity, with a role (light, humidifier, dehumidifier, ventilation, circulation fan).
- **Controller**: backend loop that reads bound sensors via HA and drives actuators toward grow settings. Algorithm per actuator: hysteresis (bang-bang with min on/off time) or PID.
- **Ventilation-first staging**: controller strategy that uses helpful room air before enabling second-stage humidification or dehumidification; moisture is compared using absolute humidity.
- **Manual mode**: per-actuator suspension of the controller, with optional auto-expiry.
- **Fail-safe**: per-actuator behaviour (hold last / safe-off / safe-on) when HA or a sensor is unavailable.
- **VPD corridor**: the minimum and maximum vapour pressure deficit (kPa) target for an Area and phase. GrowFlow displays it on the temperature/RH chart and converts it to an effective humidity band.
- **Leaf offset**: the assumed difference between air temperature and leaf temperature used when calculating VPD. GrowFlow defaults to -2 °C, but the offset can be adjusted per Area.
- **Sensor history**: timestamped readings collected from bound Home Assistant sensors, downsampled for charts and retained for the configured number of days.
