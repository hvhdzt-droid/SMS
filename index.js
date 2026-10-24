
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const express = require("express");

const app = express();
app.get("/", (req, res) => res.send("Rase Messages is online!"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("تأكد من TOKEN و CLIENT_ID و GUILD_ID.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// مهلة بين الرسائل لمنع السبام
const cooldowns = new Map();
const COOLDOWN_MS = 15000;

const setupCommand = new SlashCommandBuilder()
  .setName("setup-secret")
  .setDescription("إنشاء لوحة الرسائل الخاصة")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [setupCommand.toJSON()] }
  );

  console.log("تم تسجيل أمر /setup-secret بنجاح.");
}

client.once("ready", async () => {
  console.log(`البوت متصل: ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("خطأ تسجيل الأوامر:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    // إنشاء لوحة الرسائل
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "setup-secret"
    ) {
      if (!interaction.memberPermissions.has(
        PermissionFlagsBits.ManageGuild
      )) {
        return interaction.reply({
          content: "تحتاج صلاحية إدارة السيرفر.",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("✉️ مركز الرسائل الخاصة")
        .setDescription(
          "تبي ترسل رسالة خاصة لعضو في السيرفر؟\n\n" +
          "اضغط الزر بالأسفل، واختر المستلم واكتب رسالتك.\n\n" +
          "• اسم المرسل يظهر للمستلم.\n" +
          "• لازم يكون المستلم قادرًا على استقبال رسائل البوت.\n" +
          "• ممنوع استخدام النظام للإزعاج أو التهديد."
        )
        .setFooter({ text: "Rase Messages" });

      const button = new ButtonBuilder()
        .setCustomId("secret_open")
        .setLabel("إرسال رسالة خاصة")
        .setEmoji("✉️")
        .setStyle(ButtonStyle.Primary);

      await interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(button)
        ]
      });

      return;
    }

    // فتح قائمة اختيار المستلم
    if (
      interaction.isButton() &&
      interaction.customId === "secret_open"
    ) {
      const selector = new UserSelectMenuBuilder()
        .setCustomId("secret_recipient")
        .setPlaceholder("اختر الشخص الذي تريد مراسلته")
        .setMinValues(1)
        .setMaxValues(1);

      await interaction.reply({
        content: "من الشخص الذي تريد إرسال الرسالة إليه؟",
        components: [
          new ActionRowBuilder().addComponents(selector)
        ],
        ephemeral: true
      });

      return;
    }

    // بعد اختيار المستلم، افتح نموذج كتابة الرسالة
    if (
      interaction.isUserSelectMenu() &&
      interaction.customId === "secret_recipient"
    ) {
      const recipientId = interaction.values[0];

      if (recipientId === interaction.user.id) {
        return interaction.reply({
          content: "ما تقدر ترسل رسالة لنفسك.",
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`secret_modal:${recipientId}`)
        .setTitle("كتابة الرسالة");

      const messageInput = new TextInputBuilder()
        .setCustomId("message_text")
        .setLabel("اكتب رسالتك")
        .setPlaceholder("اكتب رسالتك هنا...")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(1)
        .setMaxLength(1000)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(messageInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // إرسال الرسالة إلى الخاص
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("secret_modal:")
    ) {
      await interaction.deferReply({ ephemeral: true });

      const recipientId = interaction.customId.split(":")[1];
      const messageText = interaction.fields
        .getTextInputValue("message_text")
        .trim();

      if (!messageText) {
        return interaction.editReply("اكتب رسالة قبل الإرسال.");
      }

      const now = Date.now();
      const lastSent = cooldowns.get(interaction.user.id) || 0;
      const remaining = COOLDOWN_MS - (now - lastSent);

      if (remaining > 0) {
        return interaction.editReply(
          `انتظر ${Math.ceil(remaining / 1000)} ثانية قبل إرسال رسالة أخرى.`
        );
      }

      if (recipientId === interaction.user.id) {
        return interaction.editReply("ما تقدر ترسل رسالة لنفسك.");
      }

      const recipient = await client.users.fetch(recipientId);

      const dmEmbed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("✉️ وصلتك رسالة من عضو")
        .setDescription(messageText)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setFooter({
          text: `المرسل: ${interaction.user.tag}`
        })
        .setTimestamp();

      await recipient.send({ embeds: [dmEmbed] });

      cooldowns.set(interaction.user.id, now);

      await interaction.editReply(
        `✅ تم إرسال رسالتك إلى **${recipient.username}** في الخاص.`
      );
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const errorMessage =
      error.code === 50007
        ? "❌ ما قدرت أرسل الرسالة. قد يكون المستلم لا يسمح برسائل البوت."
        : "❌ حدث خطأ أثناء العملية. راجع Logs في الاستضافة.";

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage).catch(() => {});
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

client.login(TOKEN).catch(error => {
  console.error("فشل تسجيل دخول البوت:", error);
  process.exit(1);
});
