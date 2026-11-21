import { NextResponse } from "next/server";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await new Promise((resolve) => {
    const socket = net.createConnection({
      host: "biportaldev.c5nsyns7onlz.ap-south-1.rds.amazonaws.com",
      port: 5432,
      timeout: 10000,
    });

    socket.on("connect", () => {
      socket.destroy();
      resolve({ connected: true });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ connected: false, error: "Connection timeout" });
    });

    socket.on("error", (err) => {
      resolve({ connected: false, error: err.message });
    });
  });

  return NextResponse.json(result);
}