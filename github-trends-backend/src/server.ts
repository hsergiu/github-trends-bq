import { configService } from "./config/ConfigService";
import { createApp } from "./app";

const start = async () => {
  try {
    const app = await createApp();
    const config = configService.get('server');
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
