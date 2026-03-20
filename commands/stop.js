const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { stopRecording } = require('./voice.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a gravação atual e envia o áudio'),
    
    async execute(interaction, client) {
        // Verificar se o usuário está em um canal de voz
        const memberVoiceChannel = interaction.member.voice.channel;
        if (!memberVoiceChannel) {
            return interaction.reply({ 
                content: '❌ Você precisa estar em um canal de voz para usar este comando!', 
                ephemeral: true 
            });
        }
        
        // Verificar se há gravação no canal
        if (!client.recordings.has(memberVoiceChannel.id)) {
            return interaction.reply({ 
                content: '❌ Não há gravação ativa neste canal!', 
                ephemeral: true 
            });
        }
        
        const recording = client.recordings.get(memberVoiceChannel.id);
        
        // Verificar se o usuário que iniciou a gravação é o mesmo
        if (recording.startedBy !== interaction.user.tag) {
            return interaction.reply({ 
                content: '❌ Apenas quem iniciou a gravação pode pará-la!', 
                ephemeral: true 
            });
        }
        
        await interaction.reply({ 
            content: '🛑 Parando gravação...', 
            ephemeral: true 
        });
        
        // Parar gravação
        const recordingData = await stopRecording(memberVoiceChannel.id, client, 'manual');
        
        if (!recordingData) {
            return interaction.followUp({ 
                content: '❌ Erro ao parar a gravação.', 
                ephemeral: true 
            });
        }
        
        // Obter tamanho do arquivo
        const stats = fs.statSync(recordingData.filePath);
        recordingData.size = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
        
        // Criar embed com informações
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎙️ Gravação Finalizada')
            .addFields(
                { name: '📁 Servidor', value: recordingData.guildName, inline: true },
                { name: '🔊 Canal', value: recordingData.channelName, inline: true },
                { name: '⏱️ Duração', value: recordingData.duration, inline: true },
                { name: '📅 Data', value: recordingData.date, inline: true },
                { name: '🕐 Hora', value: recordingData.time, inline: true },
                { name: '🎵 Formato', value: recordingData.type, inline: true },
                { name: '💾 Tamanho', value: recordingData.size, inline: true },
                { name: '👤 Iniciado por', value: recordingData.startedBy, inline: true },
                { name: '👥 Participantes', value: recordingData.members.join(', ') || 'Nenhum', inline: false }
            )
            .setTimestamp();
        
        // Criar botões
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`download_${recordingData.id}`)
                    .setLabel('📥 Baixar Áudio')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`cancel_${recordingData.id}`)
                    .setLabel('❌ Cancelar')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.followUp({
            embeds: [embed],
            components: [row]
        });
        
        // Configurar listener para botões
        const filter = i => i.customId.startsWith('download_') || i.customId.startsWith('cancel_');
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
        
        collector.on('collect', async i => {
            if (i.customId.startsWith('download_')) {
                await i.reply({
                    content: '⬇️ Baixando áudio...',
                    ephemeral: true
                });
                
                await i.followUp({
                    files: [{
                        attachment: recordingData.filePath,
                        name: recordingData.fileName
                    }]
                });
                
            } else if (i.customId.startsWith('cancel_')) {
                await i.update({
                    content: '❌ Download cancelado.',
                    components: []
                });
            }
        });
        
        collector.on('end', async () => {
            try {
                const message = await interaction.fetchReply();
                await message.edit({ components: [] });
            } catch (error) {
                console.error('Erro ao editar mensagem:', error);
            }
        });
    }
};
