import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./db/client.js";
import { botRoutes } from "./routes/bot.js";
import { DiscordBot } from "./services/discord-bot.js";

const app = buildApp({ prisma });
const bot = new DiscordBot(prisma, undefined, undefined, undefined, app.log);
botRoutes(app, prisma, bot);
const port = Number(process.env.PORT ?? 3333);

void bot.iniciar().catch((error) => app.log.error(error));

app.addHook("onClose", async () => {
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
