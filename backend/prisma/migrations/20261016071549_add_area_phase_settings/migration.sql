-- CreateTable
CREATE TABLE "area_phase_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "phaseName" TEXT NOT NULL,
    "tempMin" REAL,
    "tempMax" REAL,
    "humidityMin" REAL,
    "humidityMax" REAL,
    "vpdMin" REAL,
    "vpdMax" REAL,
    "lightOnTime" TEXT,
    "lightOffTime" TEXT,
    "ventilationOnMinutes" INTEGER,
    "ventilationOffMinutes" INTEGER,
    "fanSchedule" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "area_phase_settings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "area_phase_settings_areaId_idx" ON "area_phase_settings"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "area_phase_settings_areaId_phaseName_key" ON "area_phase_settings"("areaId", "phaseName");
