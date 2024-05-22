import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import log from "./log";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", (c) => {
  const { frameData } = c;

  log.info(
    `route: ${frameData?.url}, fid: ${frameData?.fid}, castId-fid: ${frameData?.castId.fid}, castId-hash: ${frameData?.castId.hash}, address: ${frameData?.address}`
  );

  return c.res({
    image: (
      <div style={{ color: "white", display: "flex", fontSize: 60 }}>Hello</div>
    ),
    intents: [<Button value="like">Like</Button>],
  });
});

const port = Number(process.env.PORT) || 3000;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });

serve({
  fetch: app.fetch,
  port,
});
