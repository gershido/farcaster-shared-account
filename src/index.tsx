import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", (c) => {
  const { frameData } = c;

  return c.res({
    image: (
      <div style={{ color: "white", display: "flex", fontSize: 60 }}>
        Cast ID: {frameData?.castId}
        Message hash: {frameData?.messageHash}
      </div>
    ),
    intents: [<Button value="like">Like</Button>],
  });
});

const port = 3000;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });

serve({
  fetch: app.fetch,
  port,
});
