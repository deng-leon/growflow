ALTER TABLE "area_actuator_bindings" ADD COLUMN "kp" REAL NOT NULL DEFAULT 0.08;
ALTER TABLE "area_actuator_bindings" ADD COLUMN "ki" REAL NOT NULL DEFAULT 0.01;
ALTER TABLE "area_actuator_bindings" ADD COLUMN "kd" REAL NOT NULL DEFAULT 0.02;
ALTER TABLE "area_actuator_bindings" ADD COLUMN "windowSeconds" INTEGER NOT NULL DEFAULT 60;
