import {
  EAS,
  Offchain,
  SchemaRegistry,
  SchemaEncoder,
} from '@ethereum-attestation-service/eas-sdk'
import { ethers } from 'ethers'

const getSCWAddress = () => {
  return '0x70885b21d323FA273D65E95c454A3f43851e8775'
}

const scwPrivateKey =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

// export all values

const SCWAttest = async (recipient, schema, data, signer) => {
  const EASContractAddress = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e' // Sepolia v0.26
  const eas = new EAS(EASContractAddress)
  eas.connect(provider)

  const uid =
    '0x600a6c6e521d0f7a4443e87f60da0f28f6f5dc1abbecdeb5876d5a5b76e193ed'

  // const attestation = await eas.getAttestation(uid);
  // console.log(attestation);
  const EASVersion = await eas.getVersion()
  const CHAINID = await eas.getChainId()
  // Initialize Offchain class with EAS configuration
  const EAS_CONFIG = {
    address: EASContractAddress,
    version: EASVersion, // 0.26
    chainId: CHAINID,
  }

  const offchain = new Offchain(EAS_CONFIG, 0)

  // Initialize SchemaEncoder with the schema string
  const schemaEncoder = new SchemaEncoder(
    'address sender,uint256 value,uint256 chainId'
  )
  const encodedData = schemaEncoder.encodeData([
    {
      name: 'sender',
      value: '0xbd92a7c9BF0aE4CaaE3978f9177A696fe7eA179F',
      type: 'address',
    },
    { name: 'value', value: 1, type: 'uint256' },
    { name: 'chainId', value: 1, type: 'uint256' },
  ])

  const offchainAttestation = await offchain.signOffchainAttestation(
    {
      recipient: recipient,
      // Unix timestamp of when attestation expires. (0 for no expiration)
      expirationTime: 0,
      // Unix timestamp of current time
      time: Math.floor(Date.now() / 1000),
      revocable: false,
      nonce: 0,
      schema: schema,
      refUID:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      data: encodedData,
      version: 0,
    },
    signer
  )
}

export { getSCWAddress, scwPrivateKey, SCWAttest }
