import fs from "node:fs";
import path from "node:path";

/**
 * Genera una plantilla de test de Vitest en tests/unit/, reflejando la
 * misma ruta relativa que el archivo fuente tiene dentro de src/.
 * Uso: npm run gen:test -- src/utils/timestamp
 * (crea tests/unit/utils/timestamp.test.ts)
 */
function main(): void {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Uso: npm run gen:test -- <ruta/dentro/de/src, sin extension>");
    console.error("Ejemplo: npm run gen:test -- src/utils/timestamp");
    process.exit(1);
  }

  const normalized = arg.replace(/\.test\.ts$/, "").replace(/\.ts$/, "");
  const srcRoot = path.resolve("src");
  const absoluteModule = path.resolve(normalized);
  const relativeToSrc = path.relative(srcRoot, absoluteModule);

  if (relativeToSrc.startsWith("..")) {
    console.error(`"${arg}" no esta dentro de src/. Pasa una ruta como "src/utils/timestamp".`);
    process.exit(1);
  }

  const sourcePath = `${absoluteModule}.ts`;
  const testPath = path.resolve("tests/unit", `${relativeToSrc}.test.ts`);
  const moduleName = path.basename(relativeToSrc);

  if (fs.existsSync(testPath)) {
    console.error(`Ya existe: ${path.relative(process.cwd(), testPath)}`);
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.warn(
      `Aviso: no encontre "${path.relative(process.cwd(), sourcePath)}". Genero la plantilla igual.`
    );
  }

  let importPath = path
    .relative(path.dirname(testPath), absoluteModule)
    .split(path.sep)
    .join("/");
  if (!importPath.startsWith(".")) {
    importPath = `./${importPath}`;
  }

  const template = `import { describe, expect, it } from "vitest";
// import { } from "${importPath}";

describe("${moduleName}", () => {
  it.todo("describe el comportamiento esperado");
});
`;

  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  fs.writeFileSync(testPath, template, "utf-8");
  console.log(`Creado: ${path.relative(process.cwd(), testPath)}`);
}

main();
