import neynarClient from "./neynar";
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
} from "viem";

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

//export const addKey = async (pKey: `0x${string}`) => {
//  const walletClient = createWalletClient({
//    account: privateKeyToAccount(process.env.APP_PRIVATE_KEY as `0x${string}`),
//    transport: http(),
//  });
//  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // signature is valid for 1 day
//  const SIGNED_KEY_REQUEST_TYPEHASH = "0x16be47f1f1f50a66a48db64eba3fd35c21439c23622e513aab5b902018aec438";
//
//  const typedMetadataData = {
//    domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
//    types: {
//      SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE,
//    },
//    primaryType: "SignedKeyRequest" as const,
//    message: {
//      requestFid: BigInt(Number(process.env.FID)),
//      key: pKey,
//      deadline: deadline,
//    },
//  };
//  const metadataHash = hashTypedData(typedMetadataData);
//  const metadataSignature = await walletClient.signTypedData(typedMetadataData);
//
//  const hatsProtocolSignature = encodePacked(
//    ["bytes", "bytes32", "uint256", "bytes", "uint256"],
//    [
//      metadataSignature,
//      SIGNED_KEY_REQUEST_TYPEHASH,
//      BigInt(Number(process.env.FID)),
//      keccak256(pKey),
//      deadline,
//    ]
//  );
//
//  const metadata = encodeAbiParameters(
//    [
//      {
//        components: [
//          {
//            name: "requestFid",
//            type: "uint256",
//          },
//          {
//            name: "requestSigner",
//            type: "address",
//          },
//          {
//            name: "signature",
//            type: "bytes",
//          },
//          {
//            name: "deadline",
//            type: "uint256",
//          },
//        ],
//        type: "tuple",
//      },
//    ],
//    [
//      {
//        requestFid: fid,
//        requestSigner: delegatorContractAddress,
//        signature: hatsProtocolSignature,
//        deadline,
//      },
//    ]
//  );
//  try {
//    // console.log('isMetadataSignatureValid', await isValidSignature(delegatorContractAddress, metadataHash, metadata));
//    // const isValidSignedKeyReq = await isValidSignedKeyRequest(
//    //   fid,
//    //   hexStringPublicKey,
//    //   metadata
//    // );
//    // console.log('isValidSignedKeyReq', isValidSignedKeyReq)
//
//    const tx = await writeContract(config, {
//      abi: HatsFarcasterDelegatorAbi,
//      address: delegatorContractAddress,
//      functionName: "addKey",
//      args: [1, hexStringPublicKey, 1, metadata],
//    });
//    setOnchainTransactionHash(tx);
//    console.log("result tx", tx);
//  } catch (e) {
//    console.error("error when trying to add key", e);
//    setErrorMessage(`Failed to add key ${e}`);
//    setState(HatsProtocolSignupSteps[5]);
//  }
//};

// export const getSignedKey = async () => {
//   const createSigner = await neynarClient.createSigner();
//   const { deadline, signature } = await generate_signature(
//     createSigner.public_key
//   );
//
//   if (deadline === 0 || signature === "") {
//     throw new Error("Failed to generate signature");
//   }
//
//   const fid = await getFid();
//
//   const signedKey = await neynarClient.registerSignedKey(
//     createSigner.signer_uuid,
//     fid,
//     deadline,
//     signature
//   );
//
//   return signedKey;
// };

// const generate_signature = async function (public_key: string) {
//   if (typeof process.env.FARCASTER_DEVELOPER_MNEMONIC === "undefined") {
//     throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not defined");
//   }
//
//   const FARCASTER_DEVELOPER_MNEMONIC = process.env.FARCASTER_DEVELOPER_MNEMONIC;
//   const FID = await getFid();
//
//   const account = mnemonicToAccount(FARCASTER_DEVELOPER_MNEMONIC);
//   const appAccountKey = new ViemLocalEip712Signer(account as any);
//
//   // Generates an expiration date for the signature (24 hours from now).
//   const deadline = Math.floor(Date.now() / 1000) + 86400;
//
//   const uintAddress = hexToBytes(public_key as `0x${string}`);
//
//   const signature = await appAccountKey.signKeyRequest({
//     requestFid: BigInt(FID),
//     key: uintAddress,
//     deadline: BigInt(deadline),
//   });
//
//   if (signature.isErr()) {
//     return {
//       deadline,
//       signature: "",
//     };
//   }
//
//   const sigHex = bytesToHex(signature.value);
//
//   return { deadline, signature: sigHex };
// };
