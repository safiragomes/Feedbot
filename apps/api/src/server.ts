import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./db/client.js";
import { BotSessaoStatus } from "./generated/prisma/enums.js";
import { WhatsAppBot } from "./services/whatsapp-bot.js";

const bot = new WhatsAppBot(prisma);
const app = buildApp({ prisma, bot });
const port = Number(process.env.PORT ?? 3333);

// A fresh process never inherits a live WhatsApp socket — any CONECTADO/CONECTANDO
// status left over from a previous process (e.g. a dev-mode restart) is stale.
await prisma.botSessao.updateMany({
  where: { status: { in: [BotSessaoStatus.CONECTADO, BotSessaoStatus.CONECTANDO] } },
  data: { status: BotSessaoStatus.DESCONECTADO, numeroConectado: null },
});

// Sessões multi-device válidas sobrevivem a reinícios da API. Se as credenciais
// persistidas existirem, restaura a conexão sem exigir um novo QR code.
void bot.restaurarSessao().catch((error) => app.log.error(error));

// Verifica periodicamente. O registro LembreteAtraso torna a operação idempotente,
// inclusive depois de reinícios do processo.
const lembretesTimer = setInterval(
  () => {
    void bot.enviarLembretesDeAtraso().catch((error) => app.log.error(error));
  },
  15 * 60 * 1000,
);
lembretesTimer.unref();

app.addHook("onClose", async () => {
  clearInterval(lembretesTimer);
  await bot.encerrarParaReinicio();
});

let encerrando = false;
async function encerrar(signal: string) {
  if (encerrando) return;
  encerrando = true;
  app.log.info({ signal }, "Encerrando Feedbot de forma segura");
  try {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
process.once("SIGTERM", () => void encerrar("SIGTERM"));
process.once("SIGINT", () => void encerrar("SIGINT"));

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Feedbot API listening on port ${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
