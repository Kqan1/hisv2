import "dotenv/config"
import { config as loadEnv } from "dotenv"
import { defineConfig } from "prisma/config"

// .env.local (Next.js) varsa yükle — DATABASE_URL burada da olabilir
loadEnv({ path: ".env.local" })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});