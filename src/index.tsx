import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import {
  NeynarAPIClient,
  isApiErrorResponse,
  CastParamType,
} from "@neynar/nodejs-sdk";
import log from "./log";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", async (c) => {
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

app.frame("/shared-account/:user/:hash", async (c) => {
  const { frameData } = c;
  const user = c.req.param("user");
  const hash = c.req.param("hash");
  const url = `https://warpcast.com/${user}/${hash}`;

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  log.info(
    `route: ${frameData?.url}, fid: ${frameData?.fid}, castId-fid: ${frameData?.castId.fid}, castId-hash: ${frameData?.castId.hash}, address: ${frameData?.address}`
  );

  try {
    const { cast } = await client.lookUpCastByHashOrWarpcastUrl(
      url,
      CastParamType.Url
    );

    log.info(`cast details: ${JSON.stringify(cast)}`);

    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          author username: {cast.author.username} author fid: {cast.author.fid}{" "}
          cast hash: {cast.hash}
        </div>
      ),
      intents: [<Button value="like">Like</Button>],
    });
  } catch (error) {
    if (isApiErrorResponse(error)) {
      log.info("API Error", error.response.data);
    } else {
      log.info("Generic Error", error);
    }
    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Error
        </div>
      ),
      intents: [],
    });
  }
});

const port = Number(process.env.PORT) || 3000;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });

serve({
  fetch: app.fetch,
  port,
});
