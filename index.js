require("dotenv").config();

("use strict");

const express = require("express");
const path = require("path");
const { createServer } = require("http");

const app = express();

const server = createServer(app);

const { Client, GatewayIntentBits } = require("discord.js");
const token = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

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

client.login(token);

server.listen(8080, function () {
  console.log("Listening on http://0.0.0.0:8080");
});
