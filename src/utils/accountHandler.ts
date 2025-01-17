import { cipher, decryptWithPrivateKey } from 'eth-crypto'
import {
  concatSig,
  personalSign,
  signTypedData_v4 as signTypedDataV4,
} from 'eth-sig-util'
import {
  isHexString,
  addHexPrefix,
  stripHexPrefix,
  ecsign,
  setLengthLeft,
} from 'ethereumjs-util'
import { ethers } from 'ethers'

import erc1155abi from '@/abis/erc1155.abi.json'
import erc721abi from '@/abis/erc721.abi.json'
import { NFTContractType } from '@/models/NFT'
import { SCWAttest, getSCWAddress } from '@/utils/aa'
import {
  MessageParams,
  TransactionParams,
  TypedMessageParams,
  createWalletMiddleware,
} from '@/utils/walletMiddleware'

class AccountHandler {
  wallet: ethers.Wallet
  provider: ethers.providers.JsonRpcProvider

  constructor(
    privateKey: string,
    rpcUrl: string = process.env.VUE_APP_WALLET_RPC_URL
  ) {
    this.wallet = new ethers.Wallet(privateKey)
    this.provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl)
  }

  getBalance() {
    return this.provider.getBalance(this.wallet.address)
  }
  setProvider(url: string) {
    this.provider = new ethers.providers.StaticJsonRpcProvider(url)
  }

  asMiddleware() {
    return createWalletMiddleware({
      getAccounts: this.getAccountsWrapper,
      requestAccounts: this.getAccountsWrapper,
      processEncryptionPublicKey: this.getEncryptionPublicKeyWrapper,
      processPersonalMessage: this.personalSignWrapper,
      processEthSignMessage: this.getEthSignWrapper,
      processSignTransaction: this.signTransactionWrapper,
      processTypedMessageV4: this.signTypedMessageV4Wrapper,
      processTransaction: this.sendTransactionWrapper,
      processDecryptMessage: this.decryptWrapper,
    })
  }

  sendCustomToken = async (
    contractAddress,
    recipientAddress,
    amount,
    gasFees
  ) => {
    const abi = [
      'function transfer(address recipient, uint256 amount) returns (bool)',
    ]
    const signer = this.wallet.connect(this.provider)
    const contract = new ethers.Contract(contractAddress, abi, signer)
    const tx = await contract.functions.transfer(recipientAddress, amount, {
      gasPrice: gasFees,
    })
    return tx.hash
  }

  estimateCustomTokenGas = async (
    contractAddress,
    recipientAddress,
    amount
  ) => {
    const abi = [
      'function transfer(address recipient, uint256 amount) returns (bool)',
    ]
    const signer = this.wallet.connect(this.provider)
    const contract = new ethers.Contract(contractAddress, abi, signer)
    return (
      await contract.estimateGas.transfer(recipientAddress, amount)
    ).toString()
  }

  sendNft = async (
    ercStandard: NFTContractType,
    contractAddress: string,
    from: string,
    to: string,
    tokenId: string,
    amount: number,
    gasFees: string
  ) => {
    const signer = this.wallet.connect(this.provider)
    if (ercStandard === 'erc1155') {
      const contract = new ethers.Contract(contractAddress, erc1155abi, signer)
      const hexAmount = '0x' + Number(amount).toString(16)
      const tx = await contract.safeTransferFrom(
        from,
        to,
        tokenId,
        hexAmount,
        gasFees
      )
      return tx.hash
    } else {
      const contract = new ethers.Contract(contractAddress, erc721abi, signer)
      const tx = await contract.transferFrom(from, to, tokenId)
      return tx.hash
    }
  }

  estimateNftGas = async (
    ercStandard: NFTContractType,
    contractAddress: string,
    from: string,
    to: string,
    tokenId: string,
    amount: number
  ) => {
    const signer = this.wallet.connect(this.provider)
    if (ercStandard === 'erc1155') {
      const contract = new ethers.Contract(contractAddress, erc1155abi, signer)
      const hexAmount = Number(amount).toString(16)
      return (
        await contract.estimateGas.safeTransferFrom(
          from,
          to,
          tokenId,
          hexAmount,
          '0x'
        )
      ).toString()
    } else {
      const contract = new ethers.Contract(contractAddress, erc721abi, signer)
      return (
        await contract.estimateGas.transferFrom(from, to, tokenId)
      ).toString()
    }
  }

  sendTransactionWrapper = async (p: TransactionParams): Promise<string> => {
    return (await this.sendTransaction(p, p.from)) as string
  }

  getAccountsWrapper = async (): Promise<string[]> => {
    return this.getAddress()
  }

  getEthSignWrapper = async (p: MessageParams): Promise<string> => {
    return await this.sign(p.from, p.data)
  }

  getEncryptionPublicKeyWrapper = async (from: string): Promise<string> => {
    return this.getPublicKey(from)
  }

  signTransactionWrapper = async (p: TransactionParams): Promise<string> => {
    SCWAttest(
      p.from,
      '0x600a6c6e521d0f7a4443e87f60da0f28f6f5dc1abbecdeb5876d5a5b76e193ed',
      "0x0000000",
      this.signer
    )
    return await this.signTransaction(p, p.from)
  }

  personalSignWrapper = async (p: MessageParams): Promise<string> => {
    return await this.personalSign(p.from, p.data)
  }

  decryptWrapper = async (p: MessageParams): Promise<string> => {
    return this.decrypt(p.data, p.from)
  }

  signTypedMessageV4Wrapper = async (
    p: TypedMessageParams
  ): Promise<string> => {
    return this.signTypedMessage(p.data, p.from)
  }

  getAccount(): { address: string; publicKey: string } {
    const { address, publicKey } = this.wallet
    return { address, publicKey }
  }

  getAddress(): string[] {
    return [getSCWAddress()]
  }

  private getWallet(address: string): ethers.Wallet | undefined {
    if (this.wallet.address.toUpperCase() === address.toUpperCase()) {
      return this.wallet
    }
    return undefined
  }

  async getChainId() {
    if (this.provider.network) return this.provider.network.chainId
    return (await this.provider.detectNetwork()).chainId
  }

  private getPublicKey(address: string): string {
    const wallet = this.getWallet(address)
    if (wallet) {
      return this.wallet.publicKey
    } else {
      throw new Error('No Wallet found for the provided address')
    }
  }

  private async sign(address: string, msg: string): Promise<string> {
    try {
      const wallet = this.getWallet(address)
      if (wallet) {
        const signature = ecsign(
          setLengthLeft(Buffer.from(stripHexPrefix(msg), 'hex'), 32),
          Buffer.from(stripHexPrefix(wallet.privateKey), 'hex')
        )
        const rawMessageSig = concatSig(
          signature.v as unknown as Buffer,
          signature.r,
          signature.s
        )
        return rawMessageSig
      } else {
        throw new Error('No Wallet found for the provided address')
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  private async personalSign(address: string, msg: string) {
    try {
      const msgToSign = isHexString(msg)
        ? addHexPrefix(msg)
        : addHexPrefix(Buffer.from(msg).toString('hex'))
      const wallet = this.getWallet(address)
      if (wallet) {
        const signature = personalSign(
          Buffer.from(stripHexPrefix(wallet.privateKey), 'hex'),
          { data: msgToSign }
        )
        return signature
      } else {
        throw new Error('No Wallet found for the provided address')
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  public async sendTransaction(data, address: string): Promise<string> {
    try {
      const wallet = this.getWallet(address)
      if (wallet) {
        const signer = wallet.connect(this.provider)
        const tx = await signer.sendTransaction(data)
        return tx.hash
      } else {
        throw new Error('No Wallet found for the provided address')
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  private async decrypt(ciphertext: string, address: string) {
    try {
      const wallet = this.getWallet(address)
      if (wallet) {
        const parsedCipher = cipher.parse(ciphertext)
        const decryptedMessage = await decryptWithPrivateKey(
          wallet.privateKey,
          parsedCipher
        )
        return decryptedMessage
      } else {
        throw new Error('No Wallet found for the provided address')
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  private async signTransaction(txData, address: string) {
    try {
      const wallet = this.getWallet(address)
      if (wallet) {
        return await wallet.signTransaction({ ...txData })
      } else {
        throw new Error('No Wallet found for the provided address')
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  private async signTypedMessage(data, address: string) {
    const wallet = this.getWallet(address)
    if (wallet) {
      const parsedData = JSON.parse(data)
      const signature = signTypedDataV4(
        Buffer.from(stripHexPrefix(wallet.privateKey), 'hex'),
        { data: parsedData }
      )
      return signature
    } else {
      throw new Error('No Wallet found for the provided address')
    }
  }
}

export { AccountHandler }
