const { SlashCommandBuilder } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const { createWriteStream } = require('fs');
const prism = require('prism-media');
const path = require('path');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Entra em um canal de voz e começa a gravar')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Selecione o canal de voz')
                .setRequired(true)),
    
    async execute(interaction, client) {
        const channel = interaction.options.getChannel('canal');
        
        if (!channel.isVoiceBased()) {
            return interaction.reply({ 
                content: '❌ Por favor, selecione um canal de voz válido!', 
                ephemeral: true 
            });
        }
        
        // Verificar se já existe uma gravação neste canal
        if (client.recordings.has(channel.id)) {
            return interaction.reply({ 
                content: '❌ Este canal já está sendo gravado!', 
                ephemeral: true 
            });
        }
        
        await interaction.reply({ 
            content: `🎤 Entrando no canal ${channel.name} e iniciando gravação...`, 
            ephemeral: true 
        });
        
        try {
            // Criar conexão de voz
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            
            // Aguardar conexão ser estabelecida
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
            
            // Criar nome do arquivo
            const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
            const fileName = `recording_${channel.guild.id}_${channel.id}_${timestamp}.pcm`;
            const filePath = path.join(__dirname, '..', 'recordings', fileName);
            
            // Criar stream para salvar o áudio
            const audioStream = createWriteStream(filePath);
            
            // Configurar receivers para cada usuário no canal
            const receivers = new Map();
            
            const onSpeakingHandler = (user, speaking) => {
                if (speaking.bitfield === 0) {
                    // Usuário parou de falar
                    const receiver = receivers.get(user.id);
                    if (receiver) {
                        receiver.destroy();
                        receivers.delete(user.id);
                    }
                    return;
                }
                
                // Usuário começou a falar
                if (!receivers.has(user.id)) {
                    const audio = connection.receiver.subscribe(user.id, {
                        end: {
                            behavior: 'manual'
                        }
                    });
                    
                    const opusDecoder = new prism.opus.Decoder({
                        frameSize: 960,
                        channels: 2,
                        rate: 48000
                    });
                    
                    audio.pipe(opusDecoder).pipe(audioStream, { end: false });
                    
                    receivers.set(user.id, {
                        audio,
                        opusDecoder
                    });
                }
            };
            
            connection.receiver.speaking.on('start', (userId) => {
                const user = client.users.cache.get(userId);
                if (user) onSpeakingHandler(user, { bitfield: 1 });
            });
            
            connection.receiver.speaking.on('end', (userId) => {
                const user = client.users.cache.get(userId);
                if (user) onSpeakingHandler(user, { bitfield: 0 });
            });
            
            // Obter lista de membros no canal
            const members = channel.members.filter(m => !m.user.bot).map(m => m.user.username);
            
            // Armazenar informações da gravação
            const recordingInfo = {
                connection,
                audioStream,
                receivers,
                filePath,
                fileName,
                startTime: Date.now(),
                channelId: channel.id,
                channelName: channel.name,
                guildId: channel.guild.id,
                guildName: channel.guild.name,
                startedBy: interaction.user.tag,
                members: members,
                onSpeakingHandler
            };
            
            client.recordings.set(channel.id, recordingInfo);
            
            // Monitorar quando todos saírem do canal
            const checkChannel = setInterval(() => {
                const currentChannel = client.channels.cache.get(channel.id);
                if (!currentChannel || currentChannel.members.size <= 1) { // 1 é o próprio bot
                    clearInterval(checkChannel);
                    stopRecording(channel.id, client, 'auto');
                }
            }, 5000);
            
            recordingInfo.checkInterval = checkChannel;
            
        } catch (error) {
            console.error('Erro ao entrar no canal:', error);
            await interaction.followUp({ 
                content: '❌ Erro ao entrar no canal de voz.', 
                ephemeral: true 
            });
        }
    }
};

// Função para parar gravação (exportada para uso em outros comandos)
async function stopRecording(channelId, client, type = 'manual') {
    const recording = client.recordings.get(channelId);
    if (!recording) return null;
    
    try {
        // Limpar intervalo
        if (recording.checkInterval) {
            clearInterval(recording.checkInterval);
        }
        
        // Parar receivers
        for (const [userId, receiver] of recording.receivers) {
            receiver.audio.destroy();
        }
        
        // Fechar stream
        recording.audioStream.end();
        
        // Desconectar
        recording.connection.destroy();
        
        // Calcular duração
        const duration = Date.now() - recording.startTime;
        const durationFormatted = moment.utc(duration).format('HH:mm:ss');
        
        // Converter PCM para MP3
        const mp3Path = recording.filePath.replace('.pcm', '.mp3');
        await convertPcmToMp3(recording.filePath, mp3Path);
        
        // Criar objeto com informações da gravação
        const recordingData = {
            id: `${recording.guildId}_${recording.channelId}_${Date.now()}`,
            fileName: path.basename(mp3Path),
            filePath: mp3Path,
            guildName: recording.guildName,
            channelName: recording.channelName,
            startedBy: recording.startedBy,
            members: recording.members,
            startTime: recording.startTime,
            duration: durationFormatted,
            durationMs: duration,
            date: moment(recording.startTime).format('DD/MM/YYYY'),
            time: moment(recording.startTime).format('HH:mm:ss'),
            type: 'MP3',
            size: 'Calculando...'
        };
        
        // Remover gravação do mapa
        client.recordings.delete(channelId);
        
        return recordingData;
        
    } catch (error) {
        console.error('Erro ao parar gravação:', error);
        client.recordings.delete(channelId);
        return null;
    }
}

// Função para converter PCM para MP3
async function convertPcmToMp3(inputPath, outputPath) {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegStatic = require('ffmpeg-static');
    
    ffmpeg.setFfmpegPath(ffmpegStatic);
    
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputPath)
            .inputFormat('s16le')
            .audioFrequency(48000)
            .audioChannels(2)
            .audioBitrate(128)
            .audioCodec('libmp3lame')
            .outputOptions([
                '-acodec libmp3lame',
                '-ar 48000',
                '-ac 2',
                '-ab 128k'
            ])
            .on('end', () => {
                // Remover arquivo PCM original
                require('fs').unlinkSync(inputPath);
                resolve();
            })
            .on('error', reject)
            .save(outputPath);
    });
}

module.exports.stopRecording = stopRecording;
