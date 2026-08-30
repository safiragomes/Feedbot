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

// O navegador não participa da conexão. Este watchdog roda dentro da API e recupera
// sockets que ficaram presos sem emitir "close", inclusive com o painel fechado.
const conexaoBotTimer = setInterval(
  () => void bot.garantirConexao().catch((error) => app.log.error(error)),
  60_000,
);
conexaoBotTimer.unref();

app.addHook("onClose", async () => {
  clearInterval(conexaoBotTimer);
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
