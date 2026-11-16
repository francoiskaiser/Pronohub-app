/* Pronohub — données statiques */
"use strict";

const CATS = [
  { id: "foot", e: "⚽", label: "Football" },
  { id: "basket", e: "🏀", label: "Basket" },
  { id: "tennis", e: "🎾", label: "Tennis" },
  { id: "f1", e: "🏎️", label: "Formule 1" },
  { id: "velo", e: "🚴", label: "Cyclisme" },
  { id: "rugby", e: "🏉", label: "Rugby" },
  { id: "hockey", e: "🏒", label: "Hockey" },
  { id: "usfoot", e: "🏈", label: "Football américain" },
  { id: "vote", e: "🗳️", label: "Élections" },
  { id: "tv", e: "📺", label: "Télé et culture" },
  { id: "boulot", e: "💼", label: "Boulot" },
  { id: "potes", e: "🍻", label: "Entre potes" },
  { id: "meteo", e: "🌦️", label: "Météo" },
  { id: "autre", e: "✨", label: "Autre" },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

/* Compétitions importables automatiquement (source : ESPN, non officielle) */
const LEAGUES = [
  { id: "bel.1", sport: "soccer", cat: "foot", name: "Pro League", country: "Belgique", draw: true },
  { id: "fra.1", sport: "soccer", cat: "foot", name: "Ligue 1", country: "France", draw: true },
  { id: "eng.1", sport: "soccer", cat: "foot", name: "Premier League", country: "Angleterre", draw: true },
  { id: "esp.1", sport: "soccer", cat: "foot", name: "LaLiga", country: "Espagne", draw: true },
  { id: "ita.1", sport: "soccer", cat: "foot", name: "Serie A", country: "Italie", draw: true },
  { id: "ger.1", sport: "soccer", cat: "foot", name: "Bundesliga", country: "Allemagne", draw: true },
  { id: "ned.1", sport: "soccer", cat: "foot", name: "Eredivisie", country: "Pays-Bas", draw: true },
  { id: "uefa.champions", sport: "soccer", cat: "foot", name: "Ligue des champions", country: "Europe", draw: true },
  { id: "uefa.europa", sport: "soccer", cat: "foot", name: "Ligue Europa", country: "Europe", draw: true },
  { id: "uefa.europa.conf", sport: "soccer", cat: "foot", name: "Ligue Conférence", country: "Europe", draw: true },
  { id: "uefa.nations", sport: "soccer", cat: "foot", name: "Ligue des nations", country: "Sélections", draw: true },
  { id: "uefa.euroq", sport: "soccer", cat: "foot", name: "Qualifications Euro", country: "Sélections", draw: true },
  { id: "uefa.euro", sport: "soccer", cat: "foot", name: "Euro", country: "Sélections", draw: true },
  { id: "fifa.worldq.uefa", sport: "soccer", cat: "foot", name: "Qualifications Coupe du monde", country: "Sélections", draw: true },
  { id: "fifa.world", sport: "soccer", cat: "foot", name: "Coupe du monde", country: "Sélections", draw: true },
  { id: "caf.nations", sport: "soccer", cat: "foot", name: "Coupe d'Afrique des nations", country: "Sélections", draw: true },
  { id: "fifa.friendly", sport: "soccer", cat: "foot", name: "Matchs amicaux", country: "Sélections", draw: true },
  { id: "nba", sport: "basketball", cat: "basket", name: "NBA", country: "États-Unis", draw: false },
  { id: "nhl", sport: "hockey", cat: "hockey", name: "NHL", country: "États-Unis", draw: false },
  { id: "nfl", sport: "football", cat: "usfoot", name: "NFL", country: "États-Unis", draw: false },
];
/* Noms des sélections nationales : ESPN les donne en anglais, on les affiche en français */
const NATIONS_FR = Object.fromEntries("Belgium=Belgique|Netherlands=Pays-Bas|Germany=Allemagne|Spain=Espagne|Italy=Italie|England=Angleterre|Scotland=Écosse|Wales=Pays de Galles|Northern Ireland=Irlande du Nord|Republic of Ireland=Irlande|Ireland=Irlande|Switzerland=Suisse|Austria=Autriche|Denmark=Danemark|Sweden=Suède|Norway=Norvège|Finland=Finlande|Iceland=Islande|Poland=Pologne|Czechia=Tchéquie|Czech Republic=Tchéquie|Slovakia=Slovaquie|Hungary=Hongrie|Romania=Roumanie|Bulgaria=Bulgarie|Greece=Grèce|Türkiye=Turquie|Turkey=Turquie|Croatia=Croatie|Serbia=Serbie|Slovenia=Slovénie|Bosnia and Herzegovina=Bosnie-Herzégovine|Bosnia-Herzegovina=Bosnie-Herzégovine|Montenegro=Monténégro|North Macedonia=Macédoine du Nord|Albania=Albanie|Ukraine=Ukraine|Georgia=Géorgie|Armenia=Arménie|Azerbaijan=Azerbaïdjan|Kazakhstan=Kazakhstan|Israel=Israël|Cyprus=Chypre|Malta=Malte|Luxembourg=Luxembourg|Estonia=Estonie|Latvia=Lettonie|Lithuania=Lituanie|Belarus=Biélorussie|Moldova=Moldavie|Faroe Islands=Îles Féroé|Gibraltar=Gibraltar|Andorra=Andorre|San Marino=Saint-Marin|Liechtenstein=Liechtenstein|Russia=Russie|Brazil=Brésil|Argentina=Argentine|Uruguay=Uruguay|Colombia=Colombie|Chile=Chili|Peru=Pérou|Ecuador=Équateur|Paraguay=Paraguay|Mexico=Mexique|United States=États-Unis|USA=États-Unis|Canada=Canada|Japan=Japon|South Korea=Corée du Sud|Australia=Australie|Saudi Arabia=Arabie saoudite|Iran=Iran|Qatar=Qatar|Morocco=Maroc|Algeria=Algérie|Tunisia=Tunisie|Egypt=Égypte|Senegal=Sénégal|Ivory Coast=Côte d'Ivoire|Cameroon=Cameroun|Nigeria=Nigeria|Ghana=Ghana|Mali=Mali|DR Congo=RD Congo|Congo DR=RD Congo|South Africa=Afrique du Sud|Cape Verde=Cap-Vert|Burkina Faso=Burkina Faso|Guinea=Guinée|New Zealand=Nouvelle-Zélande|Kosovo=Kosovo".split("|").map(x => x.split("=")));
const teamName = n => (LANG === "fr" && NATIONS_FR[n]) || n;

const LEAGUE = Object.fromEntries(LEAGUES.map(l => [l.id, l]));

const AVATARS = ["🦊", "🐻", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐧", "🦉", "🐺", "🐲", "🦖", "🐝", "🦈", "🐨", "🤠", "🥷", "🧙", "🤖", "👽", "🎩", "🍀", "🔥"];

const CIRCLE_EMOJIS = ["🎯", "🍻", "⚽", "🏆", "🎲", "💼", "🏠", "🎉", "🦁", "🔥"];

/* Réglages par défaut d'un cercle */
const CIRCLE_DEFAULTS = { start: 1000, daily: 50, rescue: 300, seed: 50, bonus: 100 };

const KINDS = [
  { id: "yesno", e: "👍", label: "Oui ou non", hint: "« Thomas arrivera-t-il à l'heure ? »" },
  { id: "multi", e: "🔢", label: "Plusieurs choix", hint: "« Qui sera l'employé du mois ? »" },
  { id: "match", e: "🏟️", label: "Match", hint: "Domicile, nul ou extérieur, avec score exact en bonus" },
  { id: "vote", e: "🗳️", label: "Élection", hint: "Un choix par candidat ou par parti" },
  { id: "duel", e: "🤝", label: "Duel", hint: "Toi contre un ami, même mise des deux côtés" },
];

const BADGES = [
  { id: "first", e: "🎟️", name: "Premier ticket", desc: "Placer sa première mise" },
  { id: "creator", e: "🧪", name: "Bookmaker", desc: "Créer 5 paris" },
  { id: "nostra", e: "🔮", name: "Nostradamus", desc: "Gagner avec une cote de 3 ou plus" },
  { id: "streak", e: "🔥", name: "En feu", desc: "Gagner 3 paris d'affilée" },
  { id: "sniper", e: "🎯", name: "Score exact", desc: "Trouver le score exact d'un match" },
  { id: "whale", e: "🐋", name: "Gros poisson", desc: "Miser 500 jetons d'un coup" },
  { id: "duelist", e: "🤺", name: "Duelliste", desc: "Gagner un duel" },
  { id: "talk", e: "💬", name: "Chambreur", desc: "Écrire 10 commentaires" },
  { id: "broke", e: "💸", name: "Fauché", desc: "Se faire renflouer par la banque" },
  { id: "unlucky", e: "🙃", name: "Toujours à côté", desc: "Perdre 5 paris d'affilée" },
  { id: "champ", e: "🏆", name: "Champion", desc: "Finir une saison en tête" },
];
const BADGE = Object.fromEntries(BADGES.map(b => [b.id, b]));

const REACTIONS = ["🔥", "😂", "😱", "👏", "🤡"];
