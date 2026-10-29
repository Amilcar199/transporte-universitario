CREATE TYPE "public"."route_service_type" AS ENUM('university', 'intercity');--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "service_type" "route_service_type" DEFAULT 'university' NOT NULL;