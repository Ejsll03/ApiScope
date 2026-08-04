import fs from "node:fs";
import path from "node:path";

/**
 * tsc no copia assets que no sean .ts -- las migrations .sql
 * (src/migrations/*.sql) necesitan terminar junto a su runMigrations.js
 * compilado en dist/migrations/, porque runMigrations() las busca por
 * default en __dirname. Sin este paso, el paquete publicado nunca
 * encuentra sus propias migrations.
 */
function main(): void {
  const srcDir = path.resolve("src/migrations");
  const distDir = path.resolve("dist/migrations");

  fs.mkdirSync(distDir, { recursive: true });

  const sqlFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith(".sql"));
  for (const filename of sqlFiles) {
    fs.copyFileSync(path.join(srcDir, filename), path.join(distDir, filename));
  }

  console.log(`Copiadas ${sqlFiles.length} migration(s) .sql a dist/migrations/.`);
}

main();
