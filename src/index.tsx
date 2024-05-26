import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import { isApiErrorResponse, CastParamType } from "@neynar/nodejs-sdk";
import { PrismaClient } from "@prisma/client";
import log from "./log";
import neynarClient from "./neynar";
import prismaClient from "./prisma";
import {
  getMetadata,
  getSigner,
  getValidCasterAddresses,
  isSharedAccount,
} from "./utils";
import { HATS_FARCASTER_DELEGATOR_ABI } from "./constants";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", async (c) => {
  // log.info(`context: ${JSON.stringify(c, null, 2)}`);

  return c.res({
    image: (
      <div
        style={{
          color: "white",
          display: "flex",
          fontSize: 40,
          flexDirection: "column",
        }}
      >
        <div>Select by user name</div>
      </div>
    ),
    intents: [
      <TextInput placeholder="Search by user name" />,
      <Button value="search" action="/shared-account/check">
        Search
      </Button>,
      <Button value="create">Create New</Button>,
    ],
  });
});

app.frame("/shared-account/check", async (c) => {
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

  log.info(`frameData: ${JSON.stringify(frameData, null, 2)}`);

  try {
    const {
      result: { user: sharedAccount },
    } = await neynarClient.lookupUserByUsername(frameData.inputText);

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount)}`);

    const isSharedAccout = await isSharedAccount(
      sharedAccount.custodyAddress as `0x${string}`
    );

    if (!isSharedAccout) {
      return c.res({
        image: (
          <div style={{ color: "white", display: "flex", fontSize: 60 }}>
            The user is not a shared account
          </div>
        ),
        intents: [<Button.Reset>Back</Button.Reset>],
      });
    }

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

    await prismaClient.signer.create({
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
  const key = c.req.param("key") as `0x${string}`;

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

app.frame(
  "/shared-account/:sharedAccountName/cast/:castUser/:castHash",
  async (c) => {
    const { frameData } = c;
    const sharedAccountName = c.req.param("sharedAccountName");
    const castUser = c.req.param("castUser");
    const castHash = c.req.param("castHash");
    const url = `https://warpcast.com/${castUser}/${castHash}`;

    if (frameData === undefined) {
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

    const userFid = frameData.fid;
    let sharedAccountFid: number | undefined;
    let sharedAccountAddress: `0x${string}` | undefined;

    try {
      const { result: sharedAccountResult } =
        await neynarClient.lookupUserByUsername(sharedAccountName);
      const { user: sharedAccount } = sharedAccountResult;
      sharedAccountFid = sharedAccount.fid;
      sharedAccountAddress = sharedAccount.custodyAddress as `0x${string}`;
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

    let validCasterAddresses: `0x${string}`[] | undefined;

    try {
      const res = await neynarClient.fetchBulkUsers([userFid]);
      const verifiedAddresses = res.users[0].verified_addresses
        .eth_addresses as `0x${string}`[];
      validCasterAddresses = await getValidCasterAddresses(
        sharedAccountAddress as `0x${string}`,
        verifiedAddresses
      );

      if (validCasterAddresses.length === 0) {
        return c.res({
          image: (
            <div style={{ color: "white", display: "flex", fontSize: 60 }}>
              Error: not a valid caster
            </div>
          ),
          intents: [],
        });
      }
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

    try {
      const { cast } = await neynarClient.lookUpCastByHashOrWarpcastUrl(
        url,
        CastParamType.Url
      );

      log.info(`cast details: ${JSON.stringify(cast)}`);

      return c.res({
        image: (
          <div style={{ color: "white", display: "flex", fontSize: 60 }}>
            author username: {cast.author.username} author fid:{" "}
            {cast.author.fid} cast hash: {cast.hash}
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
  }
);

const port = Number(process.env.PORT) || 3000;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });

serve({
  fetch: app.fetch,
  port,
});
