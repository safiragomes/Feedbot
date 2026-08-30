import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { WhatsAppBot } from "../../src/services/whatsapp-bot.js";

const diretorios: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    diretorios.splice(0).map((diretorio) => rm(diretorio, { recursive: true, force: true })),
  );
});

describe("desvinculação do número do bot", () => {
  it("limpa a sessão local sem chamar logout do WhatsApp", async () => {
    const authDir = await mkdtemp(join(tmpdir(), "feedbot-auth-"));
    diretorios.push(authDir);
    await writeFile(join(authDir, "creds.json"), "credencial-antiga");

    const prisma = {
      botSessao: { upsert: vi.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaClient;
    const removerListeners = vi.fn();
    const encerrar = vi.fn();
    const logout = vi.fn(() => new Promise(() => undefined));
    const bot = new WhatsAppBot(prisma, authDir);
    (bot as unknown as { socket: unknown }).socket = {
      user: { id: "558199999999:1@s.whatsapp.net" },
      ev: { removeAllListeners: removerListeners },
      end: encerrar,
      logout,
    };

    await expect(bot.desvincular()).resolves.toBeUndefined();
    // authDir em produção é a raiz de um volume Docker — não dá pra apagar o próprio
    // ponto de montagem, só o conteúdo. O diretório continua existindo (vazio).
    await expect(stat(authDir)).resolves.toMatchObject({});
    await expect(stat(join(authDir, "creds.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(logout).not.toHaveBeenCalled();
    expect(encerrar).toHaveBeenCalledOnce();
    expect(removerListeners).toHaveBeenCalledTimes(3);
  });

  it("continua apagando os demais arquivos mesmo se um deles não puder ser removido", async () => {
    const authDir = await mkdtemp(join(tmpdir(), "feedbot-auth-"));
    diretorios.push(authDir);
    await writeFile(join(authDir, "creds.json"), "credencial-antiga");
    const bloqueado = join(authDir, "bloqueado");
    await mkdir(bloqueado);
    await writeFile(join(bloqueado, "arquivo.json"), "x");
    // Sem permissão de escrita no diretório, o arquivo dentro dele não pode ser
    // desvinculado — reproduz o caso real de um arquivo de sessão com permissão
    // inconsistente que travava a limpeza inteira antes desta correção.
    await chmod(bloqueado, 0o500);

    const prisma = {
      botSessao: { upsert: vi.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaClient;
    const bot = new WhatsAppBot(prisma, authDir);

    try {
      await expect(bot.desvincular()).resolves.toBeUndefined();
      await expect(stat(join(authDir, "creds.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await chmod(bloqueado, 0o700);
    }
  });
});
