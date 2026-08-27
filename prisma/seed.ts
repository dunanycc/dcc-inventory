import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "../app/generated/prisma/client";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  for (const location of [
    { code: "BAR", name: "Bar" },
    { code: "STARTER_SHACK", name: "Starter Shack" },
  ]) {
    await prisma.location.upsert({
      where: { code: location.code },
      update: { name: location.name, active: true },
      create: location,
    });
  }

  console.log("Seeded locations: Bar, Starter Shack");
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error("Location seed failed.");
    throw error;
  });
