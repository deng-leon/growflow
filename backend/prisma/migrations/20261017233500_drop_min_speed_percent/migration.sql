-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_area_actuator_bindings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "speedEntityId" TEXT,
    "maxSpeedPercent" INTEGER NOT NULL DEFAULT 100,
    "algorithm" TEXT NOT NULL DEFAULT 'hysteresis',
    "failSafe" TEXT NOT NULL DEFAULT 'off',
    "minOnSeconds" INTEGER NOT NULL DEFAULT 60,
    "minOffSeconds" INTEGER NOT NULL DEFAULT 60,
    "kp" REAL NOT NULL DEFAULT 0.08,
    "ki" REAL NOT NULL DEFAULT 0.01,
    "kd" REAL NOT NULL DEFAULT 0.02,
    "windowSeconds" INTEGER NOT NULL DEFAULT 60,
    "manualUntil" DATETIME,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "area_actuator_bindings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_area_actuator_bindings" ("algorithm", "areaId", "createdAt", "entityId", "failSafe", "id", "kd", "ki", "kp", "manual", "manualUntil", "maxSpeedPercent", "minOffSeconds", "minOnSeconds", "role", "speedEntityId", "updatedAt", "windowSeconds") SELECT "algorithm", "areaId", "createdAt", "entityId", "failSafe", "id", "kd", "ki", "kp", "manual", "manualUntil", "maxSpeedPercent", "minOffSeconds", "minOnSeconds", "role", "speedEntityId", "updatedAt", "windowSeconds" FROM "area_actuator_bindings";
DROP TABLE "area_actuator_bindings";
ALTER TABLE "new_area_actuator_bindings" RENAME TO "area_actuator_bindings";
CREATE INDEX "area_actuator_bindings_areaId_idx" ON "area_actuator_bindings"("areaId");
CREATE UNIQUE INDEX "area_actuator_bindings_areaId_role_key" ON "area_actuator_bindings"("areaId", "role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

