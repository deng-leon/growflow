# 0001 Home Assistant control architecture

Status: accepted (grilling session)

- Control loop runs in the growflow backend and calls HA; it does not generate HA automations.
- Transport: HA WebSocket for state subscription, REST for service calls.
- Connection: Supervisor proxy when running as add-on, long-lived token for standalone Docker.
- Bindings are per Area; settings extend existing phase targets, Area overrides win.
- Repos merge into one (add-on manifest lives in the growflow repo).
- First scope: light, humidifier, dehumidifier, ventilation, circulation fans, sensors.
- Safety: per-actuator fail-safe and manual mode with optional expiry.
- Algorithms: hysteresis and PID, selectable.
