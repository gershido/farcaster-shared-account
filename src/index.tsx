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
import { PrismaClient } from "@prisma/client";
import log from "./log";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", async (c) => {
  const { frameData } = c;

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  return c.res({
    action: "/select",
    image: (
      <div style={{ color: "white", display: "flex", fontSize: 60 }}>
        Select a shared account by its user name
      </div>
    ),
    intents: [
      <TextInput placeholder="Enter shared account user name" />,
      <Button value="submit" action="/select">
        Submit
      </Button>,
    ],
  });
});

app.frame("/select", async (c) => {
  const { frameData } = c;

  if (frameData === undefined || frameData.inputText === undefined) {
    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Error
        </div>
      ),
      intents: [],
    });
  }

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  try {
    const { result } = await client.lookupUserByUsername(frameData.inputText);
    const { user: sharedAccount } = result;

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount)}`);

    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Shared Account: {sharedAccount.username}
        </div>
      ),
      intents: [
        <Button
          value="continue"
          action={`/shared-account/${sharedAccount.username}`}
        >
          Continue
        </Button>,
      ],
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

app.frame("/shared-account/:name", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("name");

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  try {
    const { result } = await client.lookupUserByUsername(sharedAccountName);
    const { user: sharedAccount } = result;

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount)}`);

    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Shared Account: {sharedAccount.username}
        </div>
      ),
      intents: [
        <Button
          value="register"
          action={`/shared-account/${sharedAccount.username}/register/${frameData?.fid}`}
        >
          Register
        </Button>,
      ],
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

app.frame("/shared-account/:name/register/:user", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("name");
  const userFid = c.req.param("user");

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  try {
    const { result: sharedAccountResult } = await client.lookupUserByUsername(
      sharedAccountName
    );
    const { user: sharedAccount } = sharedAccountResult;

    const { users: userToRegisterResult } = await client.fetchBulkUsers([
      Number(userFid),
    ]);
    const userToRegister = userToRegisterResult[0];

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount)}`);
    log.info(`userToRegister: ${JSON.stringify(userToRegister)}`);

    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Shared Account: {sharedAccount.username}
          User to register: {userToRegister.username}
        </div>
      ),
      intents: [<Button value="claim">Claim</Button>],
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

/*
app.frame("/shared-account/register", async (c) => {
  const { frameData } = c;

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  try {
    const { cast } = await client.fetchBulkUsers([frameData?.fid])

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
*/
app.frame("/shared-account/:name/act/:user/:hash", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("name");
  const user = c.req.param("user");
  const hash = c.req.param("hash");
  const url = `https://warpcast.com/${user}/${hash}`;

  const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

  log.info(`frame data: ${JSON.stringify(frameData)}`);

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
