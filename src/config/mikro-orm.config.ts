import "dotenv/config";
import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: ["./dist/**/*.entity.js"],
  entitiesTs: ["./src/**/*.entity.ts"],
  migrations: {
    path: "./dist/mikro/migrations",
    pathTs: "./src/mikro/migrations",
  },
  extensions: [Migrator],
});
