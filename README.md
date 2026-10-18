# GrowFlow - Plant Tracking System

_Comprehensive plant tracking system with complete lifecycle management and timeline documentation._

## About

GrowFlow is a standalone plant tracking application designed for documenting the complete grow process from germination to harvest. Built with modern web technologies, it provides detailed lifecycle tracking, care event logging, and comprehensive analytics for plant cultivation management.

![Dashboard Overview](assets/dashboard_view.png)
_Dashboard with plant overview and status monitoring_

![Plant Detail View](assets/plant_detail_view.png)
_Detailed plant timeline with phase tracking and care events_

## Features

- 🌱 **Complete Plant Lifecycle**: Track plants through 9 growth phases (germination → seedling → vegetation → pre_flower → flowering → flushing → harvest → drying → curing)
- 💧 **Care Event Logging**: Record watering, feeding, training, observations, and harvests with detailed data
- 🧬 **Strain Management**: Track genetics, breeding information, and custom phase templates
- 📈 **Timeline Analytics**: Complete plant timeline visualization and progress tracking
- 📊 **Dashboard Overview**: Monitor all active plants and their current status
- 🌐 **Modern Web UI**: Responsive Material-UI interface optimized for desktop and mobile

> ⚠️ This project is under active development. Features and interfaces may change.

## Tech Stack

- **Backend**: Express.js + TypeScript + SQLite + TypeORM
- **Frontend**: React + TypeScript + Material-UI + React Query
- **Database**: SQLite with TypeORM for reliable data persistence
- **Deployment**: Docker with multi-stage builds for production optimization

## Installation

### Docker Compose (Recommended)

1. Clone the repository:

```bash
git clone https://github.com/grow-flow/growflow.git
cd growflow
```

2. Start with Docker Compose:

```bash
docker-compose up -d
```

3. Access the application at `http://localhost:8080`

> **Note**: Due to self-signed certificates in development, Chrome is currently recommended for local testing. Other browsers may show SSL warnings when accessing via HTTPS.

### Docker

```bash
# Build and run manually
docker build -t growflow:latest .
docker run -d -p 8080:8080 -v ./data:/app/data growflow:latest
```

### Home Assistant Add-on

This repository is also the Home Assistant add-on repository; the add-on
definition is kept in `growflow-addon/` so application and add-on changes are
released together. Add this repository to the Home Assistant Add-on Store:

```text
https://github.com/deng-leon/growflow
```

The manifest and add-on image build files are in
`growflow-addon/growflow/`. See
[`growflow-addon/SETUP.md`](growflow-addon/SETUP.md) for installation details.

## Home Assistant setup

### Add-on (Supervisor mode)

Install GrowFlow from the repository above, start the add-on, and open it
through the Home Assistant sidebar. Ingress is enabled, so the add-on does not
need a host port mapping. Supervisor mode supplies `SUPERVISOR_TOKEN`
automatically; do not paste a long-lived token into the add-on options.

### Standalone Docker

Create a Home Assistant long-lived access token in **Profile → Long-Lived
Access Tokens**, then pass the URL and token to the container:

```yaml
environment:
  HA_URL: http://homeassistant:8123
  HA_TOKEN: your-long-lived-token
  PORT: 8080
```

`HA_URL` is the Home Assistant base URL and `HA_TOKEN` stays server-side.
`PORT` is the API/web port inside the container; publish it explicitly (for
example `-p 8080:8080`). With the add-on, use Ingress instead of relying on a
host port.

### Bind entities and configure a grow

Open an Area and bind temperature, humidity, one optional `climate.*` room
entity (its current temperature/humidity attributes are shown live), and
optional VPD sensors, then
bind switches for lights, humidifier, dehumidifier, ventilation, and
circulation fan. Configure per-phase Area grow settings for temperature,
humidity, VPD corridor, light schedule, and ventilation/fan schedules. Area
targets override matching plant phase targets.

The VPD chart uses temperature on the x-axis and relative humidity on the
y-axis, plots the live reading, and supports an adjustable leaf-temperature
offset (default `-2 °C`). **Environment History** charts temperature, humidity,
and VPD for 1h, 6h, 24h, 7d, 30d, whole grow, or a custom range. Controller
actions and manually logged Area events are shown as markers.

### Controller configuration

The controller is disabled by default. Configure these exact variables:

| Variable | Default | Purpose |
|---|---:|---|
| `CONTROLLER_ENABLED` | `false` | Enable the control loop |
| `CONTROLLER_INTERVAL_MS` | `15000` | Controller tick interval |
| `CONTROLLER_STALE_AFTER_MS` | `600000` | Stale sensor/HA threshold |
| `CONTROLLER_TIMEZONE` | `$TZ` | Schedule timezone |
| `CONTROLLER_STAGING_DELAY_S` | `120` | Seconds at 100% ventilation before stage-two conditioning |
| `CONTROLLER_VENTILATION_MIN_SPEED_PERCENT` | `25` | Minimum fan speed while ventilation is active |
| `CONTROLLER_VENTILATION_SPEED_DEADBAND_PERCENT` | `5` | Fan-speed change deadband |
| `RECORDER_ENABLED` | `true` | Enable sensor history recording |
| `RECORDER_INTERVAL_MS` | `60000` | History sampling interval |
| `RETENTION_DAYS` | `180` | Sensor history retention |

`PORT` (default `8080`), `HA_URL`, and `HA_TOKEN` are also available for
standalone deployments.

### Safety

Each actuator supports a fail-safe of hold, off, or on when HA or a sensor is
unavailable. Manual mode suspends controller changes and can expire
automatically. Keep the controller disabled while binding entities, choose
conservative fail-safe settings, and test with a dummy switch before connecting
real equipment.

When room sensors are bound, the controller uses ventilation first and stages
the humidifier or dehumidifier only when room air cannot help or ventilation
has remained saturated for the staging delay. Absolute humidity is used for
moisture comparisons, so room temperature and RH are evaluated together.

### Development Setup

```bash
# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install

# Start development servers
npm run dev                    # Start both backend and frontend
cd backend && npm run dev      # Backend only (port 8080)
cd frontend && npm start       # Frontend only (port 3000)
```

## Configuration

### Environment Variables

```bash
NODE_ENV=production           # Set to production for optimized performance
DB_PATH=/app/data/growflow.db # Database file location
LOG_LEVEL=info               # Logging verbosity (trace, debug, info, warn, error)
ALLOWED_FRAME_ANCESTORS="'self',*"  # CSP frame ancestors for iframe embedding
PORT=8080                     # API/web port
HA_URL=http://homeassistant:8123
HA_TOKEN=your-long-lived-token
CONTROLLER_ENABLED=false
CONTROLLER_INTERVAL_MS=15000
CONTROLLER_STALE_AFTER_MS=600000
CONTROLLER_TIMEZONE=$TZ
CONTROLLER_STAGING_DELAY_S=120
CONTROLLER_VENTILATION_MIN_SPEED_PERCENT=25
CONTROLLER_VENTILATION_SPEED_DEADBAND_PERCENT=5
RECORDER_ENABLED=true
RECORDER_INTERVAL_MS=60000
RETENTION_DAYS=180
```

## Usage

1. **Add Strains**: Define genetics with custom phase templates and growing characteristics
2. **Plant Management**: Create plants, assign strains, and track through lifecycle phases
3. **Care Logging**: Record detailed watering, feeding, training, and observation events
4. **Timeline Tracking**: Monitor plant progress and view complete grow timelines
5. **Analytics**: Review historical data and optimize growing processes

## API Documentation

The application provides a RESTful API for all plant management operations:

- **Plants**: CRUD operations with phase management and event logging
- **Strains**: Genetic information and phase template management
- **Events**: Comprehensive care activity tracking with rich data structures

Health check endpoint available at `/api/health` for monitoring.

## Development

### Project Structure

```
growflow/
├── backend/           # Express.js API server
│   ├── src/models/   # TypeORM database models
│   ├── src/controllers/ # API route handlers
│   └── src/config/   # Application configuration
├── frontend/         # React web interface
│   ├── src/pages/   # Main application pages
│   ├── src/components/ # Reusable UI components
│   └── src/services/ # API client and utilities
├── growflow-addon/   # Home Assistant add-on repository and definition
│   ├── repository.yaml
│   └── growflow/     # manifest, Dockerfile, build.yaml, run.sh
└── data/             # SQLite database storage
```

### Development Commands

```bash
# Linting and type checking
npm run lint                  # Lint both backend and frontend
cd backend && npm run lint:fix # Auto-fix backend linting issues
cd frontend && npm run lint:fix # Auto-fix frontend linting issues

# Building
npm run build                 # Build both backend and frontend
cd backend && npm run build   # TypeScript compilation (type check)
cd frontend && npm run build  # React production build

# Testing
npm run test                  # Run all tests
cd backend && npm test        # Backend Jest tests
cd frontend && npm test       # Frontend React tests
```

## Deployment

### Production Deployment

The application is optimized for production deployment using Docker:

- **Multi-stage builds** for minimal image size
- **Layer caching** for fast rebuilds
- **Health checks** for container orchestration
- **Data persistence** via volume mounts
- **Environment-based configuration**

## Contributing

This is an active open-source project. Contributions are welcome through:

- Bug reports and feature requests via GitHub issues
- Code contributions via pull requests
- Documentation improvements
- Testing and feedback

Please ensure all code follows the established TypeScript and ESLint standards.

## License

MIT License

Copyright (c) 2025 GrowFlow
