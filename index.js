require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.recordings = new Map();

// Carregar comandos
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.data.name, command);
    }
    console.log(`✅ ${commandFiles.length} comandos carregados`);
}

// Criar pasta de gravações
const recordingsPath = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath);
    console.log('📁 Pasta de gravações criada');
}

client.once('ready', () => {
    console.log(`✅ Bot está online como ${client.user.tag}`);
    console.log(`🌐 Servidores: ${client.guilds.cache.size}`);
    
    // Registrar comandos
    const commands = [];
    for (const command of client.commands.values()) {
        commands.push(command.data.toJSON());
    }
    
    if (commands.length > 0) {
        client.application.commands.set(commands)
            .then(() => console.log('✅ Comandos registrados'))
            .catch(console.error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
        await command.execute(interaction, client);
    } catch (error) {
        console.error('Erro no comando:', error);
        await interaction.reply({ 
            content: 'Ocorreu um erro ao executar este comando.', 
            ephemeral: true 
        });
    }
});

// ============ SERVIDOR HTTP PARA HEALTH CHECK ============
const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint para health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user?.tag || 'starting',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Endpoint específico para o Railway health check
app.get('/health', (req, res) => {
    if (client.isReady()) {
        res.status(200).json({ 
            status: 'ready',
            bot: client.user.tag,
            guilds: client.guilds.cache.size
        });
    } else {
        res.status(503).json({ 
            status: 'starting',
            message: 'Bot ainda não está pronto'
        });
    }
});

// Endpoint para verificar se as gravações estão funcionando
app.get('/status', (req, res) => {
    res.json({
        bot: client.isReady() ? client.user.tag : 'disconnected',
        recordings: client.recordings.size,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Iniciar servidor HTTP
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor HTTP rodando na porta ${PORT}`);
    console.log(`🌐 Health check disponível em /health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM recebido, fechando conexões...');
    server.close();
    client.destroy();
    process.exit(0);
});

// ============ FIM DO SERVIDOR HTTP ============

// Login
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ Token não encontrado!');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Erro ao fazer login:', error.message);
    process.exit(1);
});
