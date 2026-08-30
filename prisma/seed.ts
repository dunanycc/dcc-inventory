import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "../app/generated/prisma/client";
import { seedStructuralLocations } from "../lib/location-seed";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  await seedStructuralLocations({
    createMissingLocations: (locations) => prisma.location.createMany({ data: [...locations], skipDuplicates: true }),
  });

  console.log("Seeded locations: Bar, Starter Shack");
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error("Location seed failed.");
    throw error;
  });
