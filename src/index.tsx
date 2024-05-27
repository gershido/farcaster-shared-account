import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { neynar } from "frog/hubs";
import {
  isApiErrorResponse,
  CastParamType,
  ReactionType,
} from "@neynar/nodejs-sdk";
import { hatIdDecimalToIp, hatIdToTreeId } from "@hatsprotocol/sdk-v1-core";
import { PrismaClient } from "@prisma/client";
import log from "./log";
import neynarClient from "./neynar";
import prismaClient from "./prisma";
import {
  getMetadata,
  getSigner,
  getValidCasterAddresses,
  isSharedAccount,
  getCasterHat,
  viemPublicClient,
} from "./utils";
import { HATS_FARCASTER_DELEGATOR_ABI, KEY_ADD_EVENT_ABI } from "./constants";
import { decodeEventLog } from "viem";
import "dotenv/config";

export const app = new Frog({
  hub: neynar({ apiKey: process.env.NEYNAR_API_KEY as string }),
});

app.use("/*", serveStatic({ root: "./public" }));

app.frame("/", async (c) => {
  return c.res({
    image: (
      <div
        style={{
          color: "white",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 50,
          flexDirection: "column",
          height: "100vh",
        }}
      >
        <div>Select a shared account by its user name</div>
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

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount, null, 2)}`);

    const isSharedAccout = await isSharedAccount(
      sharedAccount.custodyAddress as `0x${string}`
    );

    if (!isSharedAccout) {
      return c.res({
        image: (
          <div
            style={{
              color: "white",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              fontSize: 60,
              height: "100vh",
            }}
          >
            The user is not a shared account
          </div>
        ),
        intents: [<Button.Reset>Back</Button.Reset>],
      });
    }

    return c.res({
      image: (
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 50,
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            User name: {sharedAccount.username}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            FID: {sharedAccount.fid}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            Address: {sharedAccount.custodyAddress}
          </div>
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
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 60,
            flexDirection: "column",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          The user was not found
        </div>
      ),
      intents: [<Button.Reset>Back</Button.Reset>],
    });
  }
});

app.frame("/shared-account/:name", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("name");

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

  log.info(`frame data: ${JSON.stringify(frameData, null, 2)}`);

  try {
    const {
      result: { user: sharedAccount },
    } = await neynarClient.lookupUserByUsername(sharedAccountName);

    const { users } = await neynarClient.fetchBulkUsers([frameData.fid]);
    const user = users[0];

    const casterHat = await getCasterHat(
      sharedAccount.custodyAddress as `0x${string}`
    );

    const validCasterAddresses = await getValidCasterAddresses(
      casterHat,
      user.verified_addresses.eth_addresses as `0x${string}`[]
    );
    if (validCasterAddresses.length === 0) {
      return c.res({
        image: (
          <div
            style={{
              color: "white",
              display: "flex",
              fontSize: 50,
              flexDirection: "column",
              justifyContent: "center",
              height: "100vh",
            }}
          >
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              User name: {sharedAccount.username}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              FID: {sharedAccount.fid}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              Address: {sharedAccount.custodyAddress}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              Only wearers of the caster Hat can use this account
            </div>
          </div>
        ),
        intents: [
          <Button.Link
            href={`https://app.hatsprotocol.xyz/trees/10/${hatIdToTreeId(
              casterHat
            ).toString()}?hatId=${hatIdDecimalToIp(casterHat)}`}
          >
            Caster Hat
          </Button.Link>,
          <Button value="back" action={`/`}>
            Back
          </Button>,
        ],
      });
    }

    log.info(`validCasterAddresses: ${JSON.stringify(validCasterAddresses)}`);
    log.info(`sharedAccount.fid: ${sharedAccount.fid}`);

    const signer = await getSigner(sharedAccount.fid, validCasterAddresses);
    if (signer === null) {
      return c.res({
        image: (
          <div
            style={{
              color: "white",
              display: "flex",
              fontSize: 50,
              flexDirection: "column",
              justifyContent: "center",
              height: "100vh",
            }}
          >
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              User name: {sharedAccount.username}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              FID: {sharedAccount.fid}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              Address: {sharedAccount.custodyAddress}
            </div>
            <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
              Claim casting authority and start using the shared account
            </div>
          </div>
        ),
        intents: [
          <Button
            value="claim"
            action={`/shared-account/${sharedAccount.username}/register/${validCasterAddresses[0]}`}
          >
            Claim
          </Button>,
          <Button.Link
            href={`https://app.hatsprotocol.xyz/trees/10/${hatIdToTreeId(
              casterHat
            ).toString()}?hatId=${hatIdDecimalToIp(casterHat)}`}
          >
            Caster Hat
          </Button.Link>,
          <Button value="back" action={`/`}>
            Back
          </Button>,
        ],
      });
    }

    return c.res({
      image: (
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 50,
            flexDirection: "column",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            User name: {sharedAccount.username}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            FID: {sharedAccount.fid}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            Address: {sharedAccount.custodyAddress}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            Use the shared account by choosing a cast to respond to
          </div>
        </div>
      ),
      intents: [
        <TextInput placeholder="Enter cast url" />,
        <Button
          value="cast"
          action={`/shared-account/${sharedAccount.username}/cast`}
        >
          Continue
        </Button>,
        <Button.Link
          href={`https://app.hatsprotocol.xyz/trees/10/${hatIdToTreeId(
            casterHat
          ).toString()}?hatId=${hatIdDecimalToIp(casterHat)}`}
        >
          Caster Hat
        </Button.Link>,
        <Button value="back" action={`/`}>
          Back
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

app.frame("/shared-account/:name/register/:address", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("name");
  const address = c.req.param("address");

  log.info(`frame data: ${JSON.stringify(frameData, null, 2)}`);

  try {
    const {
      result: { user: sharedAccount },
    } = await neynarClient.lookupUserByUsername(sharedAccountName);

    log.info(`sharedAccount: ${JSON.stringify(sharedAccount, null, 2)}`);

    const signer = await neynarClient.createSigner();

    log.info(`signer: ${JSON.stringify(signer, null, 2)}`);

    return c.res({
      action: `/finish/${signer.signer_uuid}`,
      image: (
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 60,
            flexDirection: "column",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            User name: {sharedAccount.username}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            FID: {sharedAccount.fid}
          </div>
          <div style={{ display: "flex", margin: "10px", flexWrap: "wrap" }}>
            Address to register: {address}
          </div>
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

  return c.contract({
    abi: HATS_FARCASTER_DELEGATOR_ABI,
    chainId: "eip155:10",
    functionName: "addKey",
    args: [1, key, 1, metadata],
    to: sharedAccountAddress,
  });
});

app.frame("/finish/:uuid", async (c) => {
  const { transactionId } = c;
  const uuid = c.req.param("uuid");

  const receipt = await viemPublicClient.waitForTransactionReceipt({
    hash: transactionId as `0x${string}`,
  });

  const event = decodeEventLog({
    abi: KEY_ADD_EVENT_ABI,
    eventName: "Add",
    data: receipt.logs[0].data,
    topics: receipt.logs[0].topics,
  });

  await prismaClient.signer.create({
    data: {
      id: uuid,
      ethAddr: receipt.from.toLowerCase(),
      eddsaKey: event.args.keyBytes,
      fid: event.args.fid.toString(),
    },
  });

  return c.res({
    image: (
      <div style={{ color: "white", display: "flex", fontSize: 60 }}>
        Transaction ID: {transactionId}
      </div>
    ),
  });
});

app.frame("/shared-account/:sharedAccountName/cast", async (c) => {
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

  const sharedAccountName = c.req.param("sharedAccountName");
  const url = frameData.inputText;

  log.info(`frame data: ${JSON.stringify(frameData, null, 2)}`);

  try {
    const { cast } = await neynarClient.lookUpCastByHashOrWarpcastUrl(
      url,
      CastParamType.Url
    );

    return c.res({
      image: (
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 40,
            flexDirection: "column",
            height: "100vh",
            width: "100vw",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "60%",
              alignItems: "center",
              backgroundColor: "yellow",
            }}
          >
            <img
              src={`https://client.warpcast.com/v2/cast-image?castHash=${cast.hash}`}
              style={{
                objectFit: "fill",
                width: "100%",
                height: "100%",
              }}
            />
          </div>
        </div>
      ),
      intents: [
        <Button
          value="cast"
          action={`/shared-account/${sharedAccountName}/cast/${cast.hash}`}
        >
          Continue
        </Button>,
        <Button value="back" action={`/`}>
          Back
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
          Invalid cast url
        </div>
      ),
      intents: [
        <Button value="back" action={`/`}>
          Back
        </Button>,
      ],
    });
  }
});

app.frame("/shared-account/:sharedAccountName/cast/:hash", async (c) => {
  const { frameData } = c;
  const sharedAccountName = c.req.param("sharedAccountName");
  const hash = c.req.param("hash");

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
  let sharedAccountFid: number;
  let sharedAccountAddress: `0x${string}`;

  try {
    const {
      result: { user: sharedAccount },
    } = await neynarClient.lookupUserByUsername(sharedAccountName);

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

  let casterHat: bigint;
  try {
    casterHat = await getCasterHat(sharedAccountAddress);
  } catch (error) {
    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Error
        </div>
      ),
      intents: [],
    });
  }

  let validCasterAddresses: `0x${string}`[];

  try {
    const res = await neynarClient.fetchBulkUsers([userFid]);
    const verifiedAddresses = res.users[0].verified_addresses
      .eth_addresses as `0x${string}`[];
    validCasterAddresses = await getValidCasterAddresses(
      casterHat,
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
      hash,
      CastParamType.Hash
    );

    log.info(`cast details: ${JSON.stringify(cast)}`);

    return c.res({
      image: (
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: 40,
            flexDirection: "column",
            height: "100vh",
            width: "100vw",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div>{`Replying as @${sharedAccountName}`}</div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "60%",
              alignItems: "center",
              backgroundColor: "yellow",
            }}
          >
            <img
              src={`https://client.warpcast.com/v2/cast-image?castHash=${hash}`}
              style={{
                objectFit: "fill",
                width: "100%",
                height: "100%",
              }}
            />
          </div>
        </div>
      ),
      intents: [
        <Button
          value="like"
          action={`/shared-account/${sharedAccountName}/cast/${hash}/react/like`}
        >
          Like
        </Button>,
        <Button
          value="recast"
          action={`/shared-account/${sharedAccountName}/cast/${hash}/react/reacast`}
        >
          Recast
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

app.frame(
  "/shared-account/:sharedAccountName/cast/:hash/react/:type",
  async (c) => {
    const { frameData } = c;
    const sharedAccountName = c.req.param("sharedAccountName");
    const hash = c.req.param("hash");
    const reactionType = c.req.param("type");

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
    let sharedAccountFid: number;
    let sharedAccountAddress: `0x${string}`;

    try {
      const {
        result: { user: sharedAccount },
      } = await neynarClient.lookupUserByUsername(sharedAccountName);

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

    let casterHat: bigint;
    try {
      casterHat = await getCasterHat(sharedAccountAddress);
    } catch (error) {
      return c.res({
        image: (
          <div style={{ color: "white", display: "flex", fontSize: 60 }}>
            Error
          </div>
        ),
        intents: [],
      });
    }

    let validCasterAddresses: `0x${string}`[];

    try {
      const res = await neynarClient.fetchBulkUsers([userFid]);
      const verifiedAddresses = res.users[0].verified_addresses
        .eth_addresses as `0x${string}`[];
      validCasterAddresses = await getValidCasterAddresses(
        casterHat,
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

    const signer = await getSigner(sharedAccountFid, validCasterAddresses);
    if (signer === null) {
      return c.res({
        image: (
          <div style={{ color: "white", display: "flex", fontSize: 60 }}>
            Error
          </div>
        ),
        intents: [],
      });
    }

    await neynarClient.publishReactionToCast(
      signer.id,
      reactionType === "like" ? ReactionType.Like : ReactionType.Recast,
      hash
    );
    return c.res({
      image: (
        <div style={{ color: "white", display: "flex", fontSize: 60 }}>
          Success!
        </div>
      ),
      intents: [
        <Button value="back" action={`/`}>
          Back
        </Button>,
      ],
    });
  }
);

const port = Number(process.env.PORT) || 3000;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });

serve({
  fetch: app.fetch,
  port,
});
