import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { EmailSender } from "../../src/services/email.js";
import { DiscordBot } from "../../src/services/discord-bot.js";

function criarBot() {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const findMany = vi
    .fn()
    .mockResolvedValue([{ nome: "Chefe Um", contaChefe: { email: "chefe1@teste.dev" } }]);
  const prisma = {
    botSessao: { upsert },
    monitor: { findMany },
  } as unknown as PrismaClient;
  const enviarAvisoBot = vi.fn().mockResolvedValue(undefined);
  const emailSender = { enviarAvisoBot } as unknown as EmailSender;
  const instancia = new DiscordBot(prisma, "token", undefined, emailSender);
  const interno = instancia as unknown as {
    client: { isReady: () => boolean };
    verificarConexao(): Promise<void>;
    avisoQuedaEnviado: boolean;
    quedaDesde?: Date;
  };
  return { interno, enviarAvisoBot };
}

// Este watchdog substitui uma versão anterior baseada nos eventos ShardDisconnect/
// ClientReady do discord.js, que tinha um bug real: ClientReady só dispara uma vez
// na vida do processo, então o aviso de "reconectado" (e o flag "já avisei a queda")
// nunca eram resetados depois da primeira instabilidade. A checagem periódica abaixo
// não depende da semântica exata de cada evento de shard — só olha isReady() a cada
// minuto — e por isso é testável de forma direta e determinística.
describe("watchdog de conexão do bot", () => {
  it("não envia e-mail enquanto a queda dura menos que o limite de tolerância", async () => {
    const { interno, enviarAvisoBot } = criarBot();
    vi.spyOn(interno.client, "isReady").mockReturnValue(false);
    interno.quedaDesde = new Date(Date.now() - 60_000);

    await interno.verificarConexao();

    expect(enviarAvisoBot).not.toHaveBeenCalled();
  });

  it("envia um único e-mail de queda mesmo com várias checagens seguidas sem reconectar", async () => {
    const { interno, enviarAvisoBot } = criarBot();
    vi.spyOn(interno.client, "isReady").mockReturnValue(false);
    interno.quedaDesde = new Date(Date.now() - 6 * 60_000);

    await interno.verificarConexao();
    await interno.verificarConexao();
    await interno.verificarConexao();

    expect(enviarAvisoBot).toHaveBeenCalledTimes(1);
    expect(interno.avisoQuedaEnviado).toBe(true);
  });

  it("envia um único e-mail de recuperação ao voltar a conectar depois de ter avisado a queda", async () => {
    const { interno, enviarAvisoBot } = criarBot();
    interno.avisoQuedaEnviado = true;
    interno.quedaDesde = new Date(Date.now() - 10 * 60_000);
    vi.spyOn(interno.client, "isReady").mockReturnValue(true);

    await interno.verificarConexao();
    await interno.verificarConexao();

    expect(enviarAvisoBot).toHaveBeenCalledTimes(1);
    expect(interno.avisoQuedaEnviado).toBe(false);
  });

  it("não envia e-mail de recuperação se nunca avisou a queda (oscilação curta que nunca passou de 5min)", async () => {
    const { interno, enviarAvisoBot } = criarBot();
    vi.spyOn(interno.client, "isReady").mockReturnValue(true);

    await interno.verificarConexao();

    expect(enviarAvisoBot).not.toHaveBeenCalled();
  });
});
