import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { InvokerWithProtectedReceive, InvokerWithProtectedReceive__factory, InvokerWithSimpleReceive, InvokerWithSimpleReceive__factory, Refunder__factory, TransparentUpgradeableProxy__factory } from "../typechain-types";
import { ContractFactory } from "@ethersproject/contracts"

/**
 * Deploys a given contract via transparent proxy
 */
export async function deployViaProxy<T extends { initialize: (...params: any) => any }>(factory: ContractFactory, initializationParams: Parameters<T['initialize']>): Promise<T> {
  const implementation = await factory.deploy();
  const proxy = await new TransparentUpgradeableProxy__factory(factory.signer).deploy(
      implementation.address,
      await factory.signer.getAddress(),
      factory.interface.encodeFunctionData(
        "initialize",
        initializationParams
      )
  );

  return factory.attach(proxy.address) as any as T
}

describe("Sending ether to a contract behind a transparent proxy", function () {
    it('Should refund back to simple account (sanity test)', async () => {
      const [deployer, sender, recipient] = await hre.ethers.getSigners();
      const refunder = await new Refunder__factory(deployer).deploy();

      const tx = async () => refunder.connect(sender).refundBack({ value: ethers.utils.parseEther("1") });

      await expect(tx)
        .to.changeEtherBalances(
            [sender, refunder],
            [0, 0]
        )
    });

    it('Should forward to simple account (sanity test)', async () => {
      const [deployer, sender, recipient] = await hre.ethers.getSigners();
      const refunder = await new Refunder__factory(deployer).deploy();
      const ether = ethers.utils.parseEther("1")

      const tx = async () => refunder.connect(sender).forwardTo(recipient.address, { value: ether });

      await expect(tx)
        .to.changeEtherBalances(
            [sender, refunder, recipient],
            [ether.mul(-1), 0, ether]
        )
    });

    it('Should NOT forward to Simple Invoker (implementation slot NOT cached)', async () => {
      const [deployer, sender, recipient] = await hre.ethers.getSigners();
      const refunder = await new Refunder__factory(deployer).deploy();
      const invoker = await deployViaProxy<InvokerWithSimpleReceive>(
        new InvokerWithSimpleReceive__factory(deployer),
        [refunder.address]
      );
      const ether = ethers.utils.parseEther("1")

      const tx = refunder.connect(sender).forwardTo(invoker.address, { value: ether, gasLimit: 8e6 });

      await expect(tx)
        .to.revertedWithoutReason()
    });

    it('Should refund back to Simple Invoker (implementation slot IS cached)', async () => {
      const [deployer, sender, recipient] = await hre.ethers.getSigners();
      const refunder = await new Refunder__factory(deployer).deploy();
      const invoker = await deployViaProxy<InvokerWithSimpleReceive>(
        new InvokerWithSimpleReceive__factory(deployer),
        [refunder.address]
      );
      const ether = ethers.utils.parseEther("1")

      const tx = async () => invoker.connect(sender).invoke(
        Refunder__factory.createInterface().encodeFunctionData(
            "refundBack"
        ),
        { value: ether, gasLimit: 8e6 }
    )

      await expect(tx)
        .to.changeEtherBalances(
            [sender, refunder, invoker],
            [ether.mul(-1), 0, ether]
        )
    });

    it('Should NOT refund back to Protected Invoker (additional slot read)', async () => {
      const [deployer, sender, recipient] = await hre.ethers.getSigners();
      const refunder = await new Refunder__factory(deployer).deploy();
      const invoker = await deployViaProxy<InvokerWithProtectedReceive>(
        new InvokerWithProtectedReceive__factory(deployer),
        [refunder.address]
      );
      const ether = ethers.utils.parseEther("1")

      const tx = invoker.connect(sender).invoke(
        Refunder__factory.createInterface().encodeFunctionData(
            "refundBack"
        ),
        { value: ether, gasLimit: 8e6 }
    )

      await expect(tx)
          .to.revertedWith('invoker.invoke(): call failed')
    });
})