ALTER TABLE "area_actuator_bindings" ADD COLUMN "minSpeedPercent" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "area_actuator_bindings" ADD COLUMN "maxSpeedPercent" INTEGER NOT NULL DEFAULT 100;
