import neynarClient from "./neynar";
import {
  HATS_FARCASTER_DELEGATOR_ABI,
  HATS_ABI,
  HATS_ADDRESS,
  HATS_FARCASTER_DELEGATOR_ADDRESS,
} from "./constants";
import prismaClient from "./prisma";
import {
  ViemLocalEip712Signer,
  SIGNED_KEY_REQUEST_TYPE,
  SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
  bytesToHexString,
} from "@farcaster/hub-nodejs";
import {
  StopImpersonatingAccountErrorType,
  bytesToHex,
  hexToBytes,
} from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import {
  encodeAbiParameters,
  encodePacked,
  hashTypedData,
  keccak256,
  createWalletClient,
  http,
  createPublicClient,
} from "viem";
import { optimism } from "viem/chains";

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(),
});

export const getCasterHat = async (
  sharedAccountAddress: `0x${string}`
): Promise<bigint> => {
  const casterHat = await publicClient.readContract({
    address: sharedAccountAddress,
    abi: HATS_FARCASTER_DELEGATOR_ABI,
    functionName: "hatId",
  });

  return casterHat;
};

export const getValidCasterAddresses = async (
  casterHat: bigint,
  userAddresses: `0x${string}`[]
): Promise<`0x${string}`[]> => {
  const calls = userAddresses.map((userAddress) => {
    return {
      address: HATS_ADDRESS,
      abi: HATS_ABI,
      functionName: "isWearerOfHat",
      args: [userAddress, casterHat],
    };
  });

  const results = await publicClient.multicall({ contracts: calls });

  const validCasterAddresses: `0x${string}`[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "success" && results[i].result === true) {
      validCasterAddresses.push(userAddresses[i]);
    }
  }
  return validCasterAddresses;
};

export const isSharedAccount = async (address: `0x${string}`) => {
  try {
    const res = await publicClient.readContract({
      address,
      abi: HATS_FARCASTER_DELEGATOR_ABI,
      functionName: "IMPLEMENTATION",
    });

    if (res.toLowerCase() === HATS_FARCASTER_DELEGATOR_ADDRESS.toLowerCase()) {
      return true;
    }
  } catch (err) {
    return false;
  }
};

export const getSigner = async (
  sharedAccountFid: number,
  userAddresses: `0x${string}`[]
) => {
  const signer = await prismaClient.signer.findFirst({
    where: {
      AND: [
        {
          fid: sharedAccountFid.toString(),
        },
        {
          ethAddr: {
            in: userAddresses,
          },
        },
      ],
    },
  });

  return signer;
};

export const getMetadata = async (key: `0x${string}`) => {
  const appAccount = privateKeyToAccount(
    process.env.APP_PRIVATE_KEY as `0x${string}`
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // signature is valid for 1 day

  const eip712Signer = new ViemLocalEip712Signer(appAccount);
  const signature = await eip712Signer.signKeyRequest({
    requestFid: BigInt(Number(process.env.APP_FID)),
    key: hexToBytes(key),
    deadline,
  });

  const metadata = encodeAbiParameters(
    [
      {
        components: [
          {
            name: "requestFid",
            type: "uint256",
          },
          {
            name: "requestSigner",
            type: "address",
          },
          {
            name: "signature",
            type: "bytes",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
        type: "tuple",
      },
    ],
    [
      {
        requestFid: BigInt(Number(process.env.APP_FID)),
        requestSigner: process.env.APP_PUBLIC_KEY as `0x${string}`,
        signature: bytesToHex(signature._unsafeUnwrap()),
        deadline,
      },
    ]
  );

  return metadata;
};
