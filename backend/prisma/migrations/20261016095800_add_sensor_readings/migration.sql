-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "areaId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "at" DATETIME NOT NULL,
    CONSTRAINT "sensor_readings_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "grow_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "sensor_readings_areaId_role_at_idx" ON "sensor_readings"("areaId", "role", "at");

-- CreateIndex
CREATE INDEX "sensor_readings_at_idx" ON "sensor_readings"("at");
