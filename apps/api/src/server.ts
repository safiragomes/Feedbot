import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./db/client.js";
import { WhatsAppBot } from "./services/whatsapp-bot.js";

const app = buildApp({ prisma, bot: new WhatsAppBot(prisma) });
const port = Number(process.env.PORT ?? 3333);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Feedbot API listening on port ${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
