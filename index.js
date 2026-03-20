require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.recordings = new Map(); // Armazena gravações ativas

// Carregar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

// Criar pasta de gravações se não existir
const recordingsPath = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath);
}

client.once('ready', () => {
    console.log(`Bot está online como ${client.user.tag}`);
    
    // Registrar comandos slash
    const commands = [];
    for (const command of client.commands.values()) {
        commands.push(command.data.toJSON());
    }
    
    client.application.commands.set(commands)
        .then(() => console.log('Comandos registrados com sucesso!'))
        .catch(console.error);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) return;
    
    try {
        await command.execute(interaction, client);
    } catch (error) {
        console.error(error);
        await interaction.reply({ 
            content: 'Ocorreu um erro ao executar este comando.', 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
