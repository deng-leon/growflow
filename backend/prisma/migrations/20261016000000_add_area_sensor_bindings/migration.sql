-- CreateTable
CREATE TABLE "area_sensor_bindings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "area_sensor_bindings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "area_sensor_bindings_areaId_role_key" ON "area_sensor_bindings"("areaId", "role");

-- CreateIndex
CREATE INDEX "area_sensor_bindings_areaId_idx" ON "area_sensor_bindings"("areaId");
