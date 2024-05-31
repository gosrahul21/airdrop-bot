import {
  Bot,
  Context,
  GrammyError,
  HttpError,
  InlineKeyboard,
  NextFunction,
} from "grammy";
import { createSolanaAddress } from "./utils/web3/createSolanaAddress";
import { getPrivateKeyBase58 } from "./utils/web3/getPrivateKeyBase58";
import { getUserFromDB } from "./utils/users/getUserFromDB";
import { saveUserData } from "./utils/users/saveUserData";
import "dotenv/config";
import { updateAndSaveReferData } from "./utils/users/updateAndSaveReferData";
import { updateChatId } from "./utils/users/updateChatId";
import {
  saveAirdropWinnerData,
  existsWinner,
  updatePoints,
  totalAirdropWinners,
  updateSubscriberPoints,
  getAirdropInfo,
} from "./utils/airdrop";
import { performAirdrip } from "./utils/airdripTransfers";

import { run } from "@grammyjs/runner";
import { encryptData } from "./utils/encryptData";
import { decryptData } from "./utils/decryptData";
import { checkProfile } from "./utils/checkProfile";
import { Keypair } from "@solana/web3.js";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { updateUserData } from "./utils/users/updateUserData";

const BOT_NAME = process.env.BOT_NAME!;

const bot = new Bot(process.env.BOT_TOKEN!);

const webLink = process.env.WEB_LINK!;

const bagsLink = `${webLink}/bags`;
const directoryUrl = `${process.env.WEB_LINK}/directory`;
const sendTokensUrl = `${process.env.WEB_LINK}/send_tokens`;
const swapTokensUrl = `${process.env.WEB_LINK}/swap_coins`;
const setProfileUrl = `${process.env.WEB_LINK}/profile`;

const runner = run(bot);

const maxWinnerCount: string = process.env.AIRDROP_MAX_COUNTER || "0";
let winnerCounter: number = 0;
let isMaxParticipation = false;
// totalAirdropWinners().then((dbCount) => {
//   winnerCounter = dbCount;
//   console.log("winnerCounter:" + winnerCounter);
// });

const checkUserDataMiddleware = async (ctx: Context, next: NextFunction) => {
  await next();

  const from = ctx.from;

  if (!from) return;

  const userData = await getUserFromDB(from.id);

  if (
    userData?.username !== from.username ||
    userData?.firstName !== from.first_name ||
    userData?.lastName !== from.last_name
  ) {
    await updateUserData(
      from.id,
      from.first_name,
      from.last_name || "",
      from.username || ""
    );
  }
};

bot.use(checkUserDataMiddleware);

const buildMainMenuButtons = (id: number) => [
  [
    InlineKeyboard.text("Claim Airdrop 🪂", "next-airdrop"),
    InlineKeyboard.webApp("Check Bags 💰", `${bagsLink}?user=${id}`),
  ],
  [
    InlineKeyboard.webApp("Send Tokens 💸", `${sendTokensUrl}?user=${id}`),
    InlineKeyboard.webApp("Swap Tokens 🤝", `${swapTokensUrl}?user=${id}`),
  ],
  [
    InlineKeyboard.webApp("Display Status 🏆", `${directoryUrl}?user=${id}`),
    InlineKeyboard.url("Join Group 👋", `https://t.me/mmoshpit`),
  ],
];

const buildAirdropMenuButtons = (id: number) => [
  [
    InlineKeyboard.text("Join Airdrip 💧", "join-airdrip"),
    InlineKeyboard.text("Show my Link 🔗", `show-link`),
  ],
];

bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  try {
    const referrerId = ctx.message.text.replace("/start ", "");

    const waitText = "Wait for a moment to the bot to initialize...";

    const messageEntity = await ctx.reply(waitText);

    let savedUser = await getUserFromDB(ctx.from.id);

    const text = `Congratulations! You’ve created your Social Wallet! ❤️‍🔥\nHere is your wallet address:`;

    const secondText = "What would you like to do next?";

    const chat = await ctx.getChat();

    if (!savedUser) {
      const profilePhotos = await ctx.api.getUserProfilePhotos(ctx.from.id);

      const newAddress = createSolanaAddress();
      console.log({newAddress});
      const photo = profilePhotos.photos[0];

      const file = photo
        ? photo[0]
          ? await ctx.api.getFile(photo[0].file_id)
          : { file_path: "" }
        : { file_path: "" };

      const pKey = getPrivateKeyBase58(newAddress.secretKey);
      console.log({pKey});
      const encryptedKey = encryptData(pKey);
      console.log({encryptedKey})
      const newUser = {
        addressPrivateKey: encryptedKey,
        addressPublicKey: newAddress.publicKey.toBase58(),
        bio: (chat as any).bio || "",
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || "",
        telegramId: ctx.from.id,
        username: ctx.from.username || "",
        image: file.file_path || "",
        referredUsers: 0,
        chatId: chat.id,
        isBot: ctx.from.is_bot,
        points: 0,
      };
      console.log({newUser});
      const insertedId = await saveUserData(newUser);
      if (referrerId) {
        const referrer = await getUserFromDB(Number(referrerId));

        if (referrer?._id) {
          await updateAndSaveReferData(referrer?._id, insertedId);
          await bot.api.deleteMessage(
            messageEntity.chat.id,
            messageEntity.message_id
          );

          await bot.api.sendMessage(
            Number(referrerId),
            `Congratulations! ${newUser.firstName} activated on Liquid Hearts Club from your link. Your share of the next airdrop just increased by 100 points! Send them a [welcome message](https://t.me/${newUser.username}) so they feel at home.`,
            {
              parse_mode: "Markdown",
            }
          );

          await ctx.reply(
            `Congratulations! By following ${referrer.firstName}'s activation link, your share of the next airdrop increased by 100 points! Send them a [thank you message](https://t.me/${referrer.username}) for inviting you to Liquid Hearts Club.`,
            {
              parse_mode: "Markdown",
            }
          );

          await ctx.reply(
            "I’ve created your Social Wallet! ❤️‍🔥\nHere is your wallet address:"
          );
          await ctx.reply(newUser.addressPublicKey);
          await ctx.reply(
            "Here is your personal Activation Link. When your friends activate Liquid Hearts Club through this link, you’ll increase your share of the next airdrop! 🪂"
          );
          await ctx.reply(
            `https://t.me/LiquidHeartsBot?start=${newUser.telegramId}`
          );
          await ctx.reply("What would you like to do next?", {
            reply_markup: {
              inline_keyboard: buildMainMenuButtons(ctx.from.id),
            },
          });

          return;
        }
      }

      savedUser = newUser;
    }

    if (!savedUser.chatId || savedUser.chatId !== chat.id) {
      await updateChatId(chat.id, savedUser._id!);
    }

    await bot.api.deleteMessage(
      messageEntity.chat.id,
      messageEntity.message_id
    );

    await ctx.reply(text);
    await ctx.reply(savedUser?.addressPublicKey || "");
    await ctx.reply(secondText, {
      reply_markup: {
        inline_keyboard: buildMainMenuButtons(ctx.from.id),
      },
    });
  } catch (err) {
    if (err instanceof GrammyError) {
      console.log("Grammy error!");
      console.error(err);
    }
    if (err instanceof HttpError) {
      console.log("HTTP Error!");
      console.error(err);
    }
  }
});

bot.catch((error) => {
  console.log(error.message);
  console.log(error.stack);
  const genericErrorMessage =
    "Sorry, something went wrong. Please try again later or communicate with Support";
  try {
    error.ctx.reply(genericErrorMessage);
  } catch (_) {}
});

const showMenu = async (ctx: Context) => {
  const text = `👋 Hey! Do you want to check your bags, display your status, send tokens or join the group?`;
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: buildMainMenuButtons(ctx.from?.id || 0),
    },
  });
};

const showCheckBags = async (ctx: Context) => {
  const text =
    "Curious about what you got in your bags? You’ve come to the right place!";
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          InlineKeyboard.webApp(
            "Check Bags 💰",
            `${bagsLink}?user=${ctx.from?.id}`
          ),
        ],
      ],
    },
  });
};

const showDisplayLeaderboard = async (ctx: Context) => {
  const text = "Where do you rank? Let’s display the status and find out.";
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          InlineKeyboard.webApp(
            "Display Status 🏆",
            `${directoryUrl}?user=${ctx.from?.id}`
          ),
        ],
      ],
    },
  });
};

const showSendTokens = async (ctx: Context) => {
  const text =
    "Want to send money, coins, badges or NFTs? That’s easy! Just let me know what to send and where you want them to go.";
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          InlineKeyboard.webApp(
            "Send Tokens 💸",
            `${sendTokensUrl}?user=${ctx.from?.id}`
          ),
        ],
      ],
    },
  });
};

const showJoinGroup = async (ctx: Context) => {
  const text =
    "Join our team and your fellow Liquid Hearts Club members in Visitors Center for guidance on getting the most out of your Social Wallet on Telegram.";
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [InlineKeyboard.url("Join Group 👋", `https://t.me/mmoshpit`)],
      ],
    },
  });
};

const showEarn = async (ctx: Context) => {
  if (!ctx.from) return;
  const text =
    "Our monthly airdrops are based on the number of points you collect.\n\nThe fastest way to build points is by sharing your Activation Link and by participating in trainings, quests and games with the whole [@‌mmoshpit](https://t.me/mmoshpit) community.\n\nHere is your activation link:";
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
  await ctx.reply(`https://t.me/${BOT_NAME}?start=${ctx.from!.id}`);
  await ctx.answerCallbackQuery();
};

const showAirdrop = async (ctx: Context) => {
  if (!ctx.from) return;
  const text =
    "MMOSH Airdrop | Liquid Hearts Club ❤️‍🔥\n\nWe’re launching our native token $MMOSH with a massive AIRDROP before $MMOSH is listed on major exchanges on January 23, 2024. Stay tuned to the Airdrop post and Announcements section of our Telegram group for details as we get closer to the event.\n\nSo here’s how it works… the more points you collect, the greater your chance of winning big! Some quick facts: \n\n🏆11,111 airdrop winners will be chosen randomly! Winners will receive Airdrop Keys.\n\n🎲You’ll get one chance at a Key for each point you earn, so even if you have only 1 point… you’ll still have a chance to win. But the more points you collect, the greater your chances!\n\n🔑There are 7 Airdrop Keys (Gold, Silver, Bronze, Red, Green, Black & White) that will be distributed randomly to winners. Each Key represents a different Airdrop amount. Everyone who qualifies will receive at least one key!\n\n🏅Top prize is for a Gold Key  — an airdrop of over $1,000 in $MMOSH!\n\nWe’ll be sharing many ways you can earn points over the next few weeks. Two great ways to get started stacking points and snagging $MMOSH are right here.\n\nJoin our Airdrips, which are smaller and more frequent $MMOSH airdrops, and share your Activation link far and wide!\n\n";

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: buildAirdropMenuButtons(ctx.from.id),
    },
  });
};

const joinAirdrip = async (ctx: Context) => {
  if (!ctx.from) return;
  const text =
    "Welcome to Airdrip!\n\nIn advance of our massive Airdrop on January 11, 2024, we’re testing out our systems with a number of smaller Airdrips. Don’t confuse these Airdrips with our big launch Airdrop. These Airdrips are smaller, they’re designed to test our system, and they’re mostly for fun. But the money is real!\n\nIn each Airdrip, we’ll send out Airdrip Keys, followed by Airdrips of $MMOSH, $LOVE or other tokens a short time later.\n\nGold Key holders will receive 40% of the Airdrop pool.\n\nSilver Key holders will receive 30% of the Airdrop pool.\n\nBronze Key holders will receive 20% of the Airdrop pool.\n\nRed Key will receive 4% of the Airdrop pool.\n\nGreen Key will receive 3% of the Airdrop pool.\n\nBlack Key will receive 2% of the Airdrop pool.\n\nWhite Key will receive 1% of the Airdrop pool.\n\nEach Airdrip Key is for one Airdrip only. We will be holding several Airdrips between now and our big Airdrop.\n\nMake sure your bot notifications are on. Each time an Airdrip starts, the bot will message all Airdrip subscribers with the size of the rewards pool and the number of entries that will be accepted. Each Airdrip will be first-come, first-served and available for only a limited number of members.\n\nYou’ll receive 25 points for subscribing, and even if you don’t win an Airdrip Key, everyone who plays will earn 350 points!\n\n";
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
  await ctx.reply("Welcome to Airdrips… and good luck! 🍀", {
    reply_markup: {
      inline_keyboard: [
        [InlineKeyboard.text("Subscribe to Airdrips", `subscribe-airdrips`)],
      ],
    },
  });
  let savedUser = await getUserFromDB(ctx.from.id);
  if (savedUser && savedUser._id) {
    let isUserAlreadyWinner = await existsWinner(savedUser.telegramId);
    if (!isUserAlreadyWinner) {
      if (winnerCounter < parseInt(maxWinnerCount)) {
        winnerCounter++;
        const newWinner = {
          addressPublicKey: savedUser.addressPublicKey,
          telegramId: savedUser.telegramId,
        };
        await saveAirdropWinnerData(newWinner);
        await updatePoints(savedUser._id, 350);
        // text =
        //   "Users Enrolled for airdrip : " +
        //   winnerCounter.toString() +
        //   "\n\n" +
        //   "There are no tasks at this time, but we’re still giving you 25 points for enrolling in Airdrips!";
      }
      // else {
      //   text =
      //     "Users Enrolled for airdrip : " +
      //     winnerCounter +
      //     "\n\n" +
      //     "There are no task at this time. Maximum users have already registered for airdrip.";
      // }
      // await addForAirdrop(savedUser);
      // } else {
      //   text =
      //     "Users Enrolled for airdrip : " +
      //     winnerCounter +
      //     "\n\n" +
      //     "You are already registered for airdrip.";
      // }
    }
  }
};

const showLink = async (ctx: Context) => {
  if (!ctx.from) return;
  const text = "Here is your activation link. Copy it and share far and wide…";
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
  await ctx.reply(`https://t.me/${BOT_NAME}?start=${ctx.from!.id}`);
};

const subscribeAirdrips = async (ctx: Context) => {
  if (!ctx.from) return;
  let text = "";
  let savedUser = await getUserFromDB(ctx.from.id);
  if (savedUser && savedUser._id && !savedUser.airdripSubscribe) {
    await updateSubscriberPoints(savedUser._id, 25);
    text = "25 points awarded";
  } else {
    text = "You have already subscribed to the Airdrips!";
  }
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
};

const showSwap = async (ctx: Context) => {
  if (!ctx.from) return;

  const text = "Want to swap tokens? You've come to the right place!";

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          InlineKeyboard.webApp(
            "Swap Tokens 🤝",
            `${swapTokensUrl}?user=${ctx.from.id}`
          ),
        ],
      ],
    },
  });
};

const showSetProfile = async (ctx: Context) => {
  if (!ctx.from) return;
  let text;
  let btnText;

  let savedUser = await getUserFromDB(ctx.from.id);
  const profiles = await checkProfile(savedUser?.addressPrivateKey || "");

  if (profiles.length === 0) {
    text =
      "To enter the MMOSH Pit, you’ll need a Profile NFT. Let’s mint one now!";
    btnText = "Mint";
  } else {
    text = "Update your Profile NFT to reflect your current vibe.";
    btnText = "Update";
  }

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          InlineKeyboard.webApp(
            `${btnText} Profile 📸`,
            `${setProfileUrl}?user=${ctx.from.id}`
          ),
        ],
      ],
    },
  });
};

const showClaimAirdrop = async (ctx: Context) => {
  if (!ctx.from) return;

  const text =
    "We’re launching our native token $MMOSH with a massive AIRDROP! $MMOSH will be listed on MEXC and Jupiter on January 23, 2024.\n\nA huge chunk of $MMOSH will be airdropped on January 11, 2024. Stay tuned to [@‌mmoshpit](https://t.me/mmoshpit) for details as we get closer to the event.\n\nHere’s how it works… the more points you collect, the greater your chance of winning big! Some quick facts:\n\n🏆11,111 airdrop winners will be chosen randomly! Winners will receive Airdrop Keys.\n\n🎟️You’ll get one chance at a Key for each point you earn, so even if you have only 1 point… you still have a chance to win. Think of these as raffle tickets. The more points you collect, the greater your chances!\n\n🔑There are 6 Airdrop Keys (Gold, Silver, Bronze, Red, Green & Black) that will be distributed randomly to winners. Each Key represents a different Airdrop amount.\n\n🏅Top prize is for a Gold Key  — an airdrop of over $1,000 in $MMOSH!\n\nWe’ll be sharing many ways you can earn points over the next few weeks. The best way to get started is by sharing your Activation Link. You’ll earn 100 points for every activation!\n\nHere is your activation link. Copy it and share far and wide…";
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
  await ctx.reply(`https://t.me/LiquidHeartsBot?start=${ctx.from.id}`);
  await ctx.answerCallbackQuery();
};

const firstAirdrip = async (ctx: Context) => {
  if (!ctx.from) return;
  let text = "You are not allowed to enroll for airdrip";
  if (!isMaxParticipation) {
    //get airdrip info from db
    let airdripInfo = await getAirdropInfo();
    let savedUser = await getUserFromDB(ctx.from.id);
    if (savedUser && savedUser._id) {
      let isUserAlreadyWinner = await existsWinner(savedUser.telegramId);
      if (!isUserAlreadyWinner) {
        if (winnerCounter < parseInt(airdripInfo.numParticipants)) {
          winnerCounter++;
          const newWinner = {
            addressPublicKey: savedUser.addressPublicKey,
            telegramId: savedUser.telegramId,
          };
          await saveAirdropWinnerData(newWinner);
          await updatePoints(savedUser._id, 350);
          text = "You successfully enrolled for first airdrip";
          if (winnerCounter === airdripInfo.numParticipants) {
            isMaxParticipation = true;
            const mintAddress = airdripInfo.mintAddress;
            await performAirdrip(mintAddress);
          }
        }
      } else {
        text = "You have already registered for the first airdrip";
      }
    }
  } else {
    text = "Sorry, maximum number of users have already enrolled";
  }

  // const text = "First Airdrip"
  await ctx.reply(text, {
    parse_mode: "Markdown",
  });
  // await ctx.reply("Welcome to Airdrips… and good luck! 🍀", {
  //   reply_markup: {
  //     inline_keyboard: [
  //       [InlineKeyboard.text("Subscribe to Airdrips", `subscribe-airdrips`)],
  //     ],
  //   },
  // });
};

bot.command("main", showMenu);
bot.command("bags", showCheckBags);
bot.command("send", showSendTokens);
bot.command("join", showJoinGroup);
bot.command("status", showDisplayLeaderboard);
bot.command("earn", showEarn);
bot.command("airdrop", showAirdrop);
bot.command("swap", showSwap);
bot.command("setprofile", showSetProfile);

bot.callbackQuery("next-airdrop", showAirdrop);
bot.callbackQuery("claim-airdrop", showClaimAirdrop);
bot.callbackQuery("join-airdrip", joinAirdrip);
bot.callbackQuery("show-link", showLink);
bot.callbackQuery("subscribe-airdrips", subscribeAirdrips);
bot.callbackQuery("first-airdrip", firstAirdrip);

bot.api.setMyCommands([
  {
    command: "main",
    description: "Main Menu",
  },
  {
    command: "airdrop",
    description: "Claim Airdrop",
  },
  {
    command: "bags",
    description: "Check Bags",
  },

  {
    command: "send",
    description: "Send Tokens",
  },
  {
    command: "swap",
    description: "Swap Tokens",
  },
  {
    command: "status",
    description: "Display Status",
  },
  {
    command: "join",
    description: "Join Group",
  },
  {
    command: "setprofile",
    description: "Set Profile",
  },
]);

const stopRunner = () => runner.isRunning() && runner.stop();

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
