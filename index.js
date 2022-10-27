require("dotenv").config();

const ethers = require("ethers");
const express = require("express");
const mongoose = require("mongoose");
const config = require("./config.json");
const { createServer } = require("http");
const CoinGecko = require("coingecko-api");

const app = express();
const token = process.env.TOKEN;
const server = createServer(app);
const CoinGeckoClient = new CoinGecko();
const { Client, GatewayIntentBits } = require("discord.js");
const { MultiCall } = require("@indexed-finance/multicall");

const abi = require("./Abi/abi1.json");
const abi2 = require("./Abi/abi2.json");
const abi3 = require("./Abi/abi3.json");
const channelId = `${process.env.CHANNEL_ID}`;
const mongoDBUrl = `${process.env.MONGO_DB_URL}`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const network = {
  name: "goerli",
  chainId: 5,
  _defaultProvider: (providers) =>
    new providers.JsonRpcProvider(
      `https://eth-goerli.alchemyapi.io/v2/${process.env.ID}`
    ),
};

const provider = ethers.getDefaultProvider(network);

const marketContract = new ethers.Contract(
  config.MARKETS["WETH/BETA"],
  abi,
  provider
);

const stateContract = new ethers.Contract(
  config.CORE_CONTRACTS.overlayV1StateContractAddress,
  abi2,
  provider
);
const tokenContract = new ethers.Contract(
  config.CORE_CONTRACTS.overlayV1TokenContractAddress,
  abi3,
  provider
);

/**
 * Listens to the build function event,
 * sends a message of %CapOI bought in new position
 * to a supporting discord channel
 */
marketContract.on("Build", async (sender, positionId, userOI) => {
  const marketCapOi = await stateContract.capOi(marketContract.address);
  const collateral = await stateContract.cost(
    marketContract.address,
    sender,
    positionId
  );

  const capOI = marketCapOi.toString();
  const percentage = userOI * 100;
  const percentageOfCapOiBought = percentage / capOI;

  const discordChannel = client.channels.cache.get(channelId);
  discordChannel.send({
    content: `New position built, cap oi: ${capOI}, user oi: ${userOI}, percentage of cap oi bought: ${percentageOfCapOiBought}% `,
  });

  discordChannel.send({
    content: `New position built with ${collateral / 1e18} $OVL as collateral`,
  });
});

/**
 * Gets triggered when /positions with name of market pair is typed
 * on the supporting discord channel.
 * Returns the amount of OVL as collateral in different positions.
 */
client.on("messageCreate", async (message) => {
  let messageArray = message.content.split(" ");

  if (messageArray[0] == "/positions" && message.channel.id == channelId) {
    if (
      messageArray[1] == undefined ||
      config.MARKETS[`${messageArray[1]}`] == undefined
    )
      return message.reply(`Invalid Parameter`);

    const marketContract = new ethers.Contract(
      config.MARKETS[`${messageArray[1]}`],
      abi,
      provider
    );

    const filter = marketContract.filters.Build();
    const eventLog = await marketContract.queryFilter(filter, 0);

    let count = [0, 0, 0, 0, 0];

    const multi = new MultiCall(provider);
    const inputs = [];

    for (let i = 0; i < eventLog.length; i++) {
      inputs.push({
        target: stateContract.address,
        function: "cost",
        args: [
          `${config.MARKETS[`${messageArray[1]}`]}`,
          `${eventLog[i].args[0]}`,
          `${eventLog[i].args[1]}`,
        ],
      });
    }

    const costData = await multi.multiCall(abi2, inputs);

    for (let i = 0; i < eventLog.length; i++) {
      const collateral = Number(costData[1][i]) / 1e18;

      if (collateral > 0 && collateral <= 10) {
        count[0] += 1;
      } else if (collateral > 10 && collateral <= 20) {
        count[1] += 1;
      } else if (collateral > 20 && collateral <= 100) {
        count[2] += 1;
      } else if (collateral > 100 && collateral <= 500) {
        count[3] += 1;
      } else if (collateral > 500 && collateral <= 1000) {
        count[4] += 1;
      }
    }

    message.reply(`
      users positions with collateral of 0 - 10 OVL is ${count[0]},
      users positions with collateral of 10 - 20 OVL is ${count[1]},
      users positions with collateral of 20 - 100 OVL is ${count[2]},
      users positions with collateral of 100 - 500 OVL is ${count[3]},
      users positions with collateral of 500 - 1000 OVL is ${count[4]}
      `);
  }
});

/**
 * Gets triggered when /uPnL with name of market pair is typed
 * on the supporting discord channel.
 * Returns the unrealized profit and loss of positions in a market.
 */
client.on("messageCreate", async (message) => {
  let messageArray = message.content.split(" ");

  if (messageArray[0] == "/uPnL" && message.channel.id == channelId) {
    if (
      messageArray[1] == undefined ||
      config.MARKETS[`${messageArray[1]}`] == undefined
    )
      return message.reply(`Invalid Parameter`);

    const marketContract = new ethers.Contract(
      config.MARKETS[`${messageArray[1]}`],
      abi,
      provider
    );

    const filter = marketContract.filters.Build();
    const eventLog = await marketContract.queryFilter(filter, 0);

    let totalProfit = 0;
    let totalloss = 0;

    const multi = new MultiCall(provider);
    const inputs = [];
    const inputs1 = [];

    for (let i = 0; i < eventLog.length; i++) {
      inputs.push({
        target: stateContract.address,
        function: "value",
        args: [
          `${config.MARKETS[`${messageArray[1]}`]}`,
          `${eventLog[i].args[0]}`,
          `${eventLog[i].args[1]}`,
        ],
      });

      inputs1.push({
        target: stateContract.address,
        function: "cost",
        args: [
          `${config.MARKETS[`${messageArray[1]}`]}`,
          `${eventLog[i].args[0]}`,
          `${eventLog[i].args[1]}`,
        ],
      });
    }

    const valueData = await multi.multiCall(abi2, inputs);
    const costData = await multi.multiCall(abi2, inputs1);

    for (let i = 0; i < eventLog.length; i++) {
      if (Number(valueData[1][i]) > Number(costData[1][i])) {
        const profit = valueData[1][i] - costData[1][i];
        totalProfit += profit;
      } else {
        const loss = costData[1][i] - valueData[1][i];
        totalloss += loss;
      }
    }
    message.reply(
      `Unrealized Profit for positions in ${messageArray[1]} market is ${
        totalProfit / 1e18
      } OVL`
    );

    message.reply(`
      Unrealized Loss for positions in ${messageArray[1]} market is ${
      totalloss / 1e18
    } OVL
      `);
  }
});

/**
 * Gets triggered when /transfers with name of market pair is typed
 * on the supporting discord channel.
 * Returns the total minted and burnt OVL in a market.
 */
client.on("messageCreate", async (message) => {
  let messageArray = message.content.split(" ");

  if (messageArray[0] == "/transfers" && message.channel.id == channelId) {
    if (
      messageArray[1] == undefined ||
      config.MARKETS[`${messageArray[1]}`] == undefined
    )
      return message.reply(`Invalid Parameter`);

    const filter1 = tokenContract.filters.Transfer(
      ethers.constants.AddressZero,
      config.MARKETS[`${messageArray[1]}`]
    );
    const mintedEventLog = await tokenContract.queryFilter(filter1, 0);

    const filter2 = tokenContract.filters.Transfer(
      config.MARKETS[`${messageArray[1]}`],
      ethers.constants.AddressZero
    );
    const burntEventLog = await tokenContract.queryFilter(filter2, 0);

    let totalBurntInMarket = 0;
    let totalMintedInMarket = 0;

    for (let i = 0; i < burntEventLog.length; i++) {
      totalBurntInMarket += Number(burntEventLog[i].args[2]);
    }

    for (let i = 0; i < mintedEventLog.length; i++) {
      totalMintedInMarket += Number(mintedEventLog[i].args[2]);
    }

    message.reply(
      `Total minted in ${messageArray[1]} market is: ${
        totalMintedInMarket / 1e18
      } OVL`
    );
    message.reply(
      `Total burnt in ${messageArray[1]} market is: ${
        totalBurntInMarket / 1e18
      } OVL`
    );
  }
});

client.on("ready", () => {
  console.log(`logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.content == "hi") {
    message.reply("Hello!!!");
  }
});

client.on("guildMemberAdd", async (member) => {
  member.guild.channels.cache.get(channelId).send({
    content: `<@${member.id}> Welcome to the server!`,
  });
});

client.on("messageCreate", async (message) => {
  if (message.content == "/price") {
    message.reply(`Ethereum current price is $${await pricing()}`);
  }
});

async function pricing() {
  let data = await CoinGeckoClient.simple.price({
    ids: ["ethereum"],
    vs_currencies: ["eur", "usd"],
  });
  return data.data.ethereum.usd;
}

client.login(token);

mongoose.connection.once("open", () => {
  console.log("connection ready");
});

mongoose.connection.on("error", (err) => {
  console.error(err);
});

server.listen(8080, async function () {
  await mongoose.connect(mongoDBUrl);
  console.log("Listening on http://0.0.0.0:8080");
});
