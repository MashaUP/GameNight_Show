// Regole di sicurezza dei link ufficiali di GameNight Show (usate da js/links.js e dai test).
//
// Stanno nel CODICE, non nella configurazione remota: chi modifica config/links.json può
// cambiare indirizzi, etichette e accendere o spegnere i link, ma non può portare l'app su
// un dominio che non sia in questo elenco. Un dominio nuovo richiede quindi una nuova versione,
// ed è voluto. Guida: docs/LINKS.md

/** Identificativo del progetto: deve coincidere con "project" in config/links.json. */
export const PROJECT = 'gamenight-show';

export const LINK_POLICY = {
  // Domini ammessi per qualsiasi link (anche quelli aggiunti in futuro), sottodomini compresi.
  hosts: ['github.com', 'mashaup.github.io', 'discord.gg', 'discord.com', 'ko-fi.com'],
  // Regole più strette per i link noti: un "discord" deve portare a Discord, e così via.
  byId: {
    github: ['github.com'],
    discord: ['discord.gg', 'discord.com'],
    kofi: ['ko-fi.com'],
    docs: ['github.com', 'mashaup.github.io'],
    bugs: ['github.com'],
    ideas: ['github.com']
  }
};
