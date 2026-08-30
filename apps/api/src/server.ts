import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./db/client.js";
import { botRoutes } from "./routes/bot.js";
import { WhatsAppBot } from "./services/whatsapp-bot.js";

const app = buildApp({ prisma });
const bot = new WhatsAppBot(prisma, undefined, undefined, undefined, app.log);
botRoutes(app, prisma, bot);
const port = Number(process.env.PORT ?? 3333);

// Sessões multi-device válidas sobrevivem a reinícios da API. Se as credenciais
// persistidas existirem, restaura a conexão sem exigir um novo QR code.
void bot.iniciar().catch((error) => app.log.error(error));

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
