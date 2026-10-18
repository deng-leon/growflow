CREATE TABLE "area_actuator_bindings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'hysteresis',
    "failSafe" TEXT NOT NULL DEFAULT 'off',
    "minOnSeconds" INTEGER NOT NULL DEFAULT 60,
    "minOffSeconds" INTEGER NOT NULL DEFAULT 60,
    "manualUntil" DATETIME,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "area_actuator_bindings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "area_actuator_bindings_areaId_role_key" ON "area_actuator_bindings"("areaId", "role");
CREATE INDEX "area_actuator_bindings_areaId_idx" ON "area_actuator_bindings"("areaId");

CREATE TABLE "action_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "action_logs_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "action_logs_areaId_createdAt_idx" ON "action_logs"("areaId", "createdAt");
