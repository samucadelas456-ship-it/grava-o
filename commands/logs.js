const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Mostra todas as gravações realizadas')
        .addIntegerOption(option =>
            option.setName('pagina')
                .setDescription('Número da página')
                .setRequired(false)),
    
    async execute(interaction, client) {
        const page = interaction.options.getInteger('pagina') || 1;
        const recordingsPerPage = 5;
        
        const recordingsPath = path.join(__dirname, '..', 'recordings');
        const files = fs.readdirSync(recordingsPath)
            .filter(file => file.endsWith('.mp3'))
            .sort((a, b) => {
                const statA = fs.statSync(path.join(recordingsPath, a));
                const statB = fs.statSync(path.join(recordingsPath, b));
                return statB.birthtimeMs - statA.birthtimeMs;
            });
        
        const totalPages = Math.ceil(files.length / recordingsPerPage);
        const startIndex = (page - 1) * recordingsPerPage;
        const endIndex = startIndex + recordingsPerPage;
        const pageFiles = files.slice(startIndex, endIndex);
        
        if (pageFiles.length === 0) {
            return interaction.reply({ 
                content: '📭 Nenhuma gravação encontrada.', 
                ephemeral: true 
            });
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📋 Histórico de Gravações')
            .setDescription(`Página ${page} de ${totalPages}`)
            .setTimestamp();
        
        const rows = [];
        
        for (const file of pageFiles) {
            const filePath = path.join(recordingsPath, file);
            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / (1024 * 1024)).toFixed(2);
            const creationDate = moment(stats.birthtime).format('DD/MM/YYYY HH:mm:ss');
            
            // Extrair informações do nome do arquivo
            const fileInfo = file.replace('recording_', '').replace('.mp3', '').split('_');
            const guildId = fileInfo[0];
            const channelId = fileInfo[1];
            const timestamp = fileInfo[2] + '_' + fileInfo[3];
            
            embed.addFields({
                name: `🎙️ ${file}`,
                value: `📅 Data: ${creationDate}\n💾 Tamanho: ${fileSize} MB\n📁 Servidor ID: ${guildId}\n🔊 Canal ID: ${channelId}`,
                inline: false
            });
            
            // Criar botão para cada gravação
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`log_download_${file}`)
                        .setLabel(`📥 Baixar ${file.substring(0, 20)}...`)
                        .setStyle(ButtonStyle.Primary)
                );
            
            rows.push(row);
        }
        
        // Botões de navegação
        const navRow = new ActionRowBuilder();
        
        if (page > 1) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`logs_page_${page - 1}`)
                    .setLabel('◀ Anterior')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        if (page < totalPages) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`logs_page_${page + 1}`)
                    .setLabel('Próxima ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        const allRows = [...rows, navRow];
        
        await interaction.reply({
            embeds: [embed],
            components: allRows
        });
        
        // Configurar listener para botões
        const filter = i => i.customId.startsWith('log_download_') || i.customId.startsWith('logs_page_');
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 120000 });
        
        collector.on('collect', async i => {
            if (i.customId.startsWith('log_download_')) {
                const fileName = i.customId.replace('log_download_', '');
                const filePath = path.join(recordingsPath, fileName);
                
                await i.reply({
                    files: [{
                        attachment: filePath,
                        name: fileName
                    }]
                });
                
            } else if (i.customId.startsWith('logs_page_')) {
                const newPage = parseInt(i.customId.replace('logs_page_', ''));
                await i.deferUpdate();
                
                // Recriar comando com nova página
                const newInteraction = {
                    ...interaction,
                    options: {
                        getInteger: () => newPage
                    }
                };
                
                await this.execute(newInteraction, client);
            }
        });
    }
};
