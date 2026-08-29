import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function arquivosTs(diretorio: string): Promise<string[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const arquivos = await Promise.all(
    entradas.map((entrada) => {
      const caminho = join(diretorio, entrada.name);
      return entrada.isDirectory() ? arquivosTs(caminho) : Promise.resolve([caminho]);
    }),
  );
  return arquivos.flat().filter((arquivo) => arquivo.endsWith(".ts"));
}

describe("limites arquiteturais", () => {
  it("impede domínio de depender de HTTP, persistência, rotas ou serviços", async () => {
    for (const arquivo of await arquivosTs(join(process.cwd(), "src/domain"))) {
      const codigo = await readFile(arquivo, "utf8");
      expect(codigo, arquivo).not.toMatch(/from\s+["'][^"']*(routes|services|db|generated|prisma)/);
    }
  });

  it("impede aplicação de depender dos adaptadores de rota ou infraestrutura externa", async () => {
    for (const arquivo of await arquivosTs(join(process.cwd(), "src/application"))) {
      const codigo = await readFile(arquivo, "utf8");
      expect(codigo, arquivo).not.toMatch(/from\s+["'][^"']*(routes|services)/);
    }
  });
});
