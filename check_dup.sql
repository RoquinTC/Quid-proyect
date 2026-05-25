SELECT "authorizationId", COUNT(*) FROM "medical_appointments" GROUP BY "authorizationId" HAVING COUNT(*) > 1;
