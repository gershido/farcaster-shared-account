import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import { isApiErrorResponse, CastParamType } from "@neynar/nodejs-sdk";
import { PrismaClient } from "@prisma/client";
import log from "./log";
import neynarClient from "./neynar";
import { getMetadata } from "./utils";
import { HATS_FARCASTER_DELEGATOR_ABI } from "./constants";
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

  try {
    const { result } = await neynarClient.lookupUserByUsername(
      frameData.inputText
    );
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

  try {
    const { result } = await neynarClient.lookupUserByUsername(
      sharedAccountName
    );
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

  try {
    const { result: sharedAccountResult } =
      await neynarClient.lookupUserByUsername(sharedAccountName);
    const { user: sharedAccount } = sharedAccountResult;

    const { users: userToRegisterResult } = await neynarClient.fetchBulkUsers([
      Number(userFid),
    ]);
    const userToRegister = userToRegisterResult[0];

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount)}`);
    log.info(`userToRegister: ${JSON.stringify(userToRegister)}`);

    const signer = await neynarClient.createSigner();

    log.info(`signer: ${JSON.stringify(signer)}`);

    const prisma = new PrismaClient();
    await prisma.signer.create({
      data: {
        id: signer.signer_uuid,
        ethAddr: "0x",
        eddsaKey: signer.public_key,
        fid: sharedAccount.fid.toString(),
      },
    });

    return c.res({
      action: "/finish",
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Shared Account: {sharedAccount.username}
          User to register: {userToRegister.username}
        </div>
      ),
      intents: [
        <Button.Transaction
          target={`/claim/${sharedAccount.custodyAddress}/${signer.public_key}`}
        >
          Claim
        </Button.Transaction>,
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

app.transaction("/claim/:sharedAccountAddress/:key", async (c) => {
  const { inputText } = c;
  const sharedAccountAddress = c.req.param(
    "sharedAccountAddress"
  ) as `0x${string}`;
  const key = c.req.param("name") as `0x${string}`;

  const metadata = await getMetadata(key);

  // Contract transaction response.
  return c.contract({
    abi: HATS_FARCASTER_DELEGATOR_ABI,
    chainId: "eip155:10",
    functionName: "addKey",
    args: [1, key, 1, metadata],
    to: sharedAccountAddress,
  });
});

app.frame("/finish", (c) => {
  const { transactionId } = c;
  return c.res({
    image: (
      <div style={{ color: "white", display: "flex", fontSize: 60 }}>
        Transaction ID: {transactionId}
      </div>
    ),
  });
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

  log.info(`frame data: ${JSON.stringify(frameData)}`);

  try {
    const { cast } = await neynarClient.lookUpCastByHashOrWarpcastUrl(
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
