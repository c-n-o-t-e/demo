require("dotenv").config();

("use strict");

const express = require("express");
const path = require("path");
const { createServer } = require("http");

const app = express();

const server = createServer(app);

const { Client, GatewayIntentBits } = require("discord.js");
const token = process.env.TOKEN;

const abi = require("./abi.json");
const ethers = require("ethers");

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
      `https://eth-goerli.alchemyapi.io/v2/RuGxhTpkUt3S6InAt33l_3NZc4pFwXxS`
    ),
};

const provider = ethers.getDefaultProvider(network);
const demoContract = new ethers.Contract(
  "0x36305dfb6f2613Be99BfA30dfE6C322738eA1479",
  abi,
  provider
);

client.on("ready", () => {
  console.log(`logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.content == "hi") {
    message.reply("Hello!!!");
  }
});

const welcomeChannelId = "1027509178455031809";

client.on("guildMemberAdd", async (member) => {
  member.guild.channels.cache.get(welcomeChannelId).send({
    content: `<@${member.id}> Welcome to the server!`,
  });
});

demoContract.on("NewMsg", async (event) => {
  const discordChannel = client.channels.cache.get(welcomeChannelId);
  discordChannel.send({ content: `new NewMsg event $${event}` });
});

client.login(token);

server.listen(8080, function () {
  console.log("Listening on http://0.0.0.0:8080");
});
