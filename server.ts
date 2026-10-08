import "dotenv/config";
import express from "express";
import path from "path";
import { createEngine, probeEngine } from "./server/engine";
import { createApp, startTempSweeper } from "./server/app";
import { isLoopback, loadConfig } from "./server/config";

async function startServer() {
  const config = loadConfig();
  const engine = createEngine(config);
  const app = createApp({ config, engine });

  startTempSweeper(config.tempDir);

  if (process.env.NODE_ENV !== "production") {
    // Imported lazily so the production bundle does not need Vite installed.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(config.port, config.host, () => {
    console.log(`ElevenOpen Studio running on http://${config.host}:${config.port}`);
    if (!isLoopback(config.host)) {
      console.warn(
        `[Security] Listening on ${config.host}. The API has no authentication; ` +
          "anyone who can reach this port can run generation jobs. Prefer HOST=127.0.0.1."
      );
    }
  });

  // Surface setup problems (missing ffmpeg, Python packages) in the console right away.
  const status = await probeEngine(engine);
  if (status.warnings.length > 0) {
    console.warn("[Setup] Audio engine check found problems:");
    status.warnings.forEach((w) => console.warn(`  - ${w}`));
  } else {
    console.log(`[Setup] Audio engine ready (Python ${status.python}, FFmpeg found).`);
  }
  status.notices.forEach((n) => console.log(`[Setup] Note: ${n}`));
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
