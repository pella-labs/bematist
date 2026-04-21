<!--
================================================================================
 ENGLISH PREAMBLE — navigation aid for non-French readers
================================================================================

**File:** `legal/review/cse-consultation-FR.md` — French Comité Social et
Économique (CSE) consultation dossier + individual-notification template
(Art. L1222-4) + projet d'accord de méthode for a Bema deployment in a
French establishment. Authoritative body in French below; this preamble is
advisory and non-binding. Owner: Workstream I (Compliance).

**STATUS: TEMPLATE — requires FR-qualified labour-and-social counsel review
before use with any customer. Do NOT ship without external counsel sign-off
(compliance PRD §10.1, action E-1 analogue for France).**

**Who uses this file.** The customer's `{{EMPLOYEUR}}` (employer) and the
`{{CSE_TITULAIRES}}` (elected CSE members) run the consultation and, where
applicable, execute the method agreement. Bema (the vendor) does NOT sign
this instrument — the parties are the employer and the CSE. Vendor-side
commitments sit in a separate DPA (Phase 2).

**Statutory triggers — cumulative, not alternative.**

- **Code du travail Art. L1222-4** — no information concerning an employee
  personally may be collected by a device which has not been brought to the
  employee's attention prior to its implementation. Load-bearing for the
  individual-notification annex (§C below).
- **Code du travail Art. L2312-38** — the CSE is consulted prior to any
  decision to implement, within the enterprise, automated means of processing
  personal management data or any modification thereto.
- **Code du travail Art. L2312-8 4°** — consultation on the introduction of
  new technologies and on any important change affecting health, safety, or
  working conditions.
- **RGPD Art. 88** — specific rules for employment-context processing;
  France has transposed via Loi Informatique et Libertés (LIL) Art. 88 + CNIL
  *Référentiel relatif aux traitements de données à caractère personnel mis
  en œuvre aux fins de gestion du personnel* (Mar. 2019) and the CNIL's
  2023–2025 guidance stream on workplace AI.
- **EDPB Opinion 2/2017 on data processing at work** — "suitability to
  monitor" triggers obligations regardless of the controller's subjective
  intent.

**Collateral statutes cited in the body:** RGPD (Règlement (UE) 2016/679)
Art. 5, 6, 12–17, 20, 25, 30, 35; Loi Informatique et Libertés (LIL) Art. 32;
Code du travail Art. L1121-1 (general proportionality of restrictions on
individual liberties at work); Art. L2312-15 and Art. L2315-78 to Art.
L2315-91 (expert resort for CSE); Art. L1225-1 and Art. L2242-17 (égalité
professionnelle — bias monitoring duty when algorithms touch HR data); Code
pénal Art. 226-16 (criminal exposure for unlawful processing).

**Load-bearing case-law anchors (2025–2026).**

- **TJ Nanterre, 29 janvier 2026 (ordonnance de référé)** — pilot / POC /
  expérimentation of an AI-adjacent workplace system is *not* exempt from
  prior CSE consultation under L2312-8 4° + L2312-38. Bema dev-opt-in
  pilots in a French subsidiary still trigger full upfront CSE consultation
  before any bytes leave dev machines. Phrased verbatim in §7 Al. 2 below.
- **TJ Paris, 2 septembre 2025 (France Télévisions)** — closes the "only an
  experimentation" loophole; confirms the L2312-38 duty attaches at the stage
  of *decision to implement*, not only at full production roll-out. Cited in
  §7 Al. 2 as corroborating authority.
- **Accord de méthode Groupe Alpha, 15 décembre 2025** — three-phase method
  (Information / Expérimentation / Diagnostic) with a parity technology
  commission and a post-deploy anonymous questionnaire. Structural template
  for §§3–5 below.
- **Accord Metlife Europe, juin 2025** — red-lines: (i) no AI-only
  redundancy decisions; (ii) AI outputs excluded from pay / career HR
  decisions; (iii) human-in-the-loop mandatory for any individual-impacting
  determination. Load-bearing for §4 permitted purposes and §5 prohibitions.

**Placeholders (replace before execution).**

- `{{EMPLOYEUR}}` — employer legal name and SIRET.
- `{{CSE_TITULAIRES}}` — names of the elected CSE titulaires.
- `{{DATE_EFFET}}` — ISO date (YYYY-MM-DD) of effect.
- `{{VERSION_LOGICIELLE}}` — Bema release tag.
- `{{IDENT_LOCATAIRE}}` — tenant identifier.
- `{{DPO_EMAIL}}` — customer DPO mailbox.
- `{{CONTACT_ESCALADE}}` — vendor escalation contact.
- `{{ETABLISSEMENTS}}` — covered French establishments (Art. L2313-1).
- `{{REPRESENTANT_PROXIMITE}}` — if applicable, proximity representatives.

**Lane boundary.** Owned solely by Workstream I. Product-side controls
(`bematist audit --tail`, `audit_events`, `bematist erase`, Tier B default,
Ed25519 tier flip) are cited as descriptive of the shipped product per
CLAUDE.md and PRD §5–§8 — not redesigned here. Where this dossier refers to
the DE Betriebsvereinbarung (for multi-jurisdictional customers), it assumes
the DE agreement from `legal/review/works-agreement-DE.md` is in force; the
two instruments are parallel and non-substituting.

**Document structure.** This file bundles three distinct instruments
conventionally separate in French practice, for draft convenience:

- **Part A — Dossier de consultation du CSE** (main body): the information +
  consultation dossier transmitted to the CSE under L2312-38 and L2312-8 4°.
- **Part B — Projet d'accord de méthode** (optional, recommended): a three-
  phase method agreement (Information / Expérimentation / Diagnostic)
  modelled on Groupe Alpha 15 déc. 2025; negotiated with the CSE during the
  consultation; becomes binding on signature.
- **Part C — Notice individuelle d'information (Art. L1222-4)**: the
  individual notification delivered to each covered employee, in parallel
  with CSE consultation, before any bytes leave the employee's endpoint.

In counsel review, each Part may be split into its own file; the draft
bundles them so the cross-references are visible end-to-end.

================================================================================
-->

# Dossier de consultation du Comité Social et Économique — Déploiement de Bema

**entre**

{{EMPLOYEUR}} — ci-après l'« Employeur » —

**et**

le Comité Social et Économique, représenté par {{CSE_TITULAIRES}} — ci-après le « CSE » —

ensemble les « Parties ».

**Date d'effet prévisionnelle :** {{DATE_EFFET}}
**Version logicielle visée :** {{VERSION_LOGICIELLE}}
**Identifiant locataire :** {{IDENT_LOCATAIRE}}
**Établissements concernés :** {{ETABLISSEMENTS}}

---

## Partie A — Dossier de consultation

### §1 Objet de la consultation

(1) L'Employeur soumet à la consultation du CSE, en application des articles
L2312-38 et L2312-8 4° du Code du travail ainsi que de l'article 88 du
Règlement (UE) 2016/679 (ci-après le « RGPD »), le projet de mise en œuvre du
système « Bema » (ci-après le « Système ») au sein de {{ETABLISSEMENTS}}.

(2) Le Système a pour objet la collecte, l'analyse et la restitution de
données d'utilisation des outils de développement assistés par intelligence
artificielle (notamment Claude Code, Codex, Cursor, Continue.dev, GitHub
Copilot et outils analogues) aux fins (i) de pilotage budgétaire (FinOps),
(ii) d'analyse de fiabilité des outils, et (iii) d'analyse agrégée au niveau
des équipes.

(3) Les Parties conviennent, conformément à la jurisprudence issue de TJ
Nanterre 29 janvier 2026 et TJ Paris 2 septembre 2025 (France Télévisions),
qu'une phase d'expérimentation, de « proof of concept » ou de pilote n'exonère
pas l'Employeur de la consultation préalable du CSE : la décision de mettre en
œuvre relève de L2312-38 dès lors qu'elle est arrêtée, indépendamment du
volume de salariés initialement concernés.

(4) L'Employeur reconnaît, en cohérence avec l'Avis 2/2017 du Comité européen
de la protection des données (CEPD), que le critère d'« aptitude à la
surveillance » s'apprécie objectivement et indépendamment de son intention
subjective. La présente consultation est donc engagée quelles que soient les
finalités déclarées.

(5) La consultation porte tant sur le principe de la mise en œuvre que sur
ses modalités techniques, organisationnelles et humaines, y compris les
paramétrages par défaut.

---

### §2 Champ d'application

(1) **Champ matériel.** Le Système couvre l'ensemble des opérations de
collecte, transmission, stockage, pseudonymisation, analyse et suppression
des données produites par les outils de développement assistés par IA
utilisés sur les postes des salariés visés à l'alinéa 2.

(2) **Champ personnel.** Sont concernés les salariés dont le poste de
travail ou les accès aux environnements de développement sont visés par
l'instrumentation du Système, ainsi que, dans la mesure où cela est
juridiquement applicable et contractuellement prévu, les intervenants
assimilés (prestataires, stagiaires) utilisant les mêmes postes ou
environnements.

(3) **Champ géographique.** La présente consultation couvre les
établissements {{ETABLISSEMENTS}}. En présence d'un CSE central et de CSE
d'établissement (Art. L2316-1 et L2316-20), les règles de compétence
respective s'appliquent ; le présent dossier peut être décliné au niveau
d'établissement selon l'accord de méthode (Partie B).

(4) **Exclusions.** Sont exclues du champ les opérations de traitement
restant strictement locales au poste de travail et ne quittant pas celui-ci,
notamment les étapes locales de rédaction et d'abstraction mises en œuvre par
le pipeline embarqué décrit au §8 Al. 5.

---

### §3 Informations transmises au CSE au titre de L2312-38

Conformément à l'article L2312-38 et à la jurisprudence constante, le CSE
reçoit, au plus tard à la date du présent dossier, les informations
suivantes, permettant l'exercice utile de ses attributions :

(1) **Description du Système.** Nature des données traitées par niveau de
collecte, flux techniques, acteurs impliqués, durée du cycle de traitement.
Un schéma de flux figure en annexe 1.

(2) **Finalités du traitement.** Finalités limitativement énumérées au §4
ci-après. Aucune finalité implicite ou évolutive n'est admise sans
consultation complémentaire du CSE.

(3) **Fondement juridique.** Intérêt légitime (RGPD Art. 6(1)(f)) avec
analyse d'équilibre documentée ; ou exécution du contrat de travail (RGPD
Art. 6(1)(b)) pour les traitements strictement nécessaires à la relation
contractuelle. Le consentement (RGPD Art. 6(1)(a)) n'est pas retenu en
raison de l'asymétrie de la relation employeur-salarié (CEPD Op. 2/2017).

(4) **Catégories de données.** Détail par niveau A / B / C au §6.
L'Employeur confirme que le paramétrage par défaut est le **niveau B**
(compteurs et enveloppes d'événements rédigées), conformément à la Décision
D7 du cahier des charges produit.

(5) **Durées de conservation.** 90 jours (niveau A et niveau B) et 30 jours
(niveau C) pour les événements bruts ; indéfinie pour les agrégats
pseudonymisés (clef tenant, jamais inter-locataire). Les durées sont
détaillées au §9.

(6) **Destinataires.** Internes : rôles limitativement énumérés au §5 Al. 3.
Externes : dans l'option « cloud géré », sous-traitants listés à la fiche
sous-traitants (Annexe 3) ; en mode « auto-hébergé », aucun destinataire
externe.

(7) **Transferts hors UE.** Modalités et garanties détaillées au §10 ;
Clauses contractuelles types 2021/914 Module 2, analyse d'impact de transfert
(TIA) et, le cas échéant, auto-certification DPF.

(8) **Analyse d'impact relative à la protection des données (AIPD).**
Modèle d'AIPD fourni en annexe 2 ; l'AIPD finale relève du Responsable de
traitement (l'Employeur), sous la supervision du DPO ({{DPO_EMAIL}}).

(9) **Consultation du DPO.** Le DPO est associé à la consultation
(Art. 39(1)(c) RGPD) ; son avis écrit est joint au dossier.

(10) **Mesures techniques et organisationnelles.** Détaillées au §8.

(11) **Droits des salariés.** Détaillés au §7.

---

### §4 Finalités autorisées

(1) Le Système ne peut être utilisé que pour les finalités limitativement
énumérées ci-après :

a) **Pilotage budgétaire (FinOps).** Analyse, au niveau des équipes et de
   l'organisation, des coûts induits par l'utilisation des outils de
   développement assistés par IA, à des fins de budgétisation, de détection
   d'anomalies de coût et d'identification agrégée de motifs d'usage
   inefficients.

b) **Analyse de fiabilité.** Analyse, au niveau agrégé, de la fiabilité des
   outils (taux d'erreur, taux de relance, abandons) et corrélation avec les
   résultats Git (pull requests fusionnées, tests verts) aux fins
   d'amélioration de la chaîne d'outils et des pratiques techniques.

c) **Analyse agrégée d'équipe.** Restitution de motifs d'usage au niveau
   collectif, sous réserve des planchers de k-anonymité du §5 Al. 4.

d) **Partage contrôlé de motifs de travail (« playbooks »),** exclusivement
   sur action expresse, documentée et révocable du ou de la salarié·e
   concerné·e. Aucun déclenchement automatique par le Système n'est admis.

(2) Toute utilisation du Système à une finalité non mentionnée à l'alinéa 1
est interdite et constitue un manquement à la présente consultation et, le
cas échéant, à l'accord de méthode (Partie B).

(3) **Exclusions expresses.** Sont en particulier exclus :

a) toute **évaluation de la performance individuelle** d'un·e salarié·e
   fondée sur les données du Système (red-line Metlife Europe, juin 2025) ;

b) toute **décision de licenciement** automatisée ou prise sur la base
   exclusive d'un traitement algorithmique fondé sur les données du Système
   (red-line Metlife Europe, juin 2025) ;

c) toute **décision de rémunération, d'avancement, de mutation ou de
   classification** fondée, en tout ou partie exclusive, sur les données du
   Système ; l'intervention humaine significative (human-in-the-loop) est
   obligatoire pour toute décision produisant des effets juridiques ou
   significativement similaires à l'égard d'un·e salarié·e (RGPD Art. 22) ;

d) toute **publication de classements individuels,** y compris listes de
   « meilleurs » ou de « moins bons » performeurs ;

e) toute **surveillance en temps réel** de l'activité individuelle, en
   particulier tout flux d'événements en direct au niveau nominatif ;

f) toute **intervention ou blocage** automatique de l'activité d'un·e
   salarié·e.

(4) Les exclusions de l'alinéa 3 sont garanties par les contrôles techniques
du §8 et par les droits reconnus au CSE au §11.

---

### §5 Interdiction du contrôle de performance et du contrôle comportemental

(1) Le Système **ne peut être utilisé aux fins de contrôle de la performance
ou du comportement individuel des salariés**. Cette clause constitue un
engagement contractuel ferme, opposable à l'Employeur par le CSE et par
chaque salarié·e.

(2) L'interdiction de l'alinéa 1 couvre en particulier :

a) l'établissement de classements individuels par indicateur de productivité,
   de qualité ou d'efficacité ;

b) l'affichage d'indicateurs de performance individuels (notamment les
   AI-Leverage-Scores individuels) à destination de l'encadrement ;
   l'interface de gestion n'affiche les indicateurs de performance qu'**au
   niveau agrégé** ;

c) l'utilisation des données du Système comme fondement **principal** ou
   **exclusif** d'une décision individuelle (cf. §4 Al. 3 c) et red-line
   Metlife).

(3) **Matrice d'accès par rôle.** L'accès aux données est restreint ainsi :

| Rôle | Niveau A | Niveau B (défaut) | Niveau C |
|---|---|---|---|
| Salarié·e (soi-même) | Compteurs propres | Compteurs + enveloppes propres | Propres + texte de prompt propre |
| Salarié·e (pair·e·s) | Agrégats d'équipe uniquement | Idem | Idem |
| Responsable d'équipe | Agrégats + compteurs par personne | + chemins hachés par personne | + texte de prompt par personne *uniquement* si la personne y a consenti projet par projet |
| Manager | Agrégats d'équipe et d'organisation | Idem | Idem — **pas de texte de prompt nominatif** hors legal hold |
| Admin | Configuration + journaux d'audit | Idem | Idem — **ne peut lire le texte de prompt** (séparation des rôles) |
| Auditeur | Journaux d'audit | Idem | Idem |

(4) **Planchers de k-anonymité.** Toute tuile d'équipe n'est affichée que
si elle satisfait aux seuils ci-après ; à défaut, la tuile est masquée et
remplacée par la mention « Cohorte insuffisante » :

a) **k ≥ 5** pour toute tuile d'équipe ; la tuile n'est pas affichée si le
   départ d'un·e seul·e salarié·e (congé, absence) ferait passer la cohorte
   sous le seuil ;

b) **k ≥ 3** comme contribution minimale pour tout cluster de prompts ;

c) **k ≥ 25** pour toute publication bruitée en confidentialité
   différentielle à partir de la Phase 2.

(5) Un indicateur individuel n'est affiché que si l'ensemble des conditions
cumulatives suivantes est rempli : (a) au moins dix sessions ; (b) au moins
cinq jours actifs ; (c) au moins trois événements de résultat ; (d) cohorte
de comparaison d'au moins huit pair·e·s. À défaut, la tuile est masquée par
la mention « Données insuffisantes ». L'approximation et l'interpolation sont
interdites.

(6) **Maturity Ladder.** Les étapes Aware / Operator / Builder / Architect
forment une vue **strictement personnelle** de l'espace coach individuel
(`/me`). Elles ne sont **jamais** accessibles à l'encadrement et ne peuvent
en aucun cas être utilisées pour une évaluation ou une décision
professionnelle. Toute attribution automatique d'un niveau à une personne
aux fins d'une décision individuelle est exclue.

---

### §6 Niveaux de collecte — Définitions et paramétrage par défaut

(1) **Niveau A — « Compteurs seuls ».** Le Système transmet exclusivement
des métriques numériques et des métadonnées techniques (identifiants de
session hachés, nom du modèle, horodatage, nombre de tokens, coût, acceptations
et rejets). Aucun contenu de prompt, aucune entrée d'outil, aucune sortie
d'outil n'est transmis.

(2) **Niveau B — « Compteurs et enveloppes rédigées » (paramétrage par
défaut).** Aux données du niveau A s'ajoutent des enveloppes d'événements
structurellement rédigées : type d'événement, chemins de fichier hachés,
classe d'erreur, durée, longueur de prompt (non le contenu), nombre de lignes
d'une modification de code (non son contenu). Le texte brut d'un prompt ou
d'une réponse d'outil n'est pas transmis. **Ce niveau est le paramétrage
par défaut du Système**, conformément à la Décision D7 du produit.

(3) **Niveau C — « Événements complets avec texte de prompt ».** Aux données
du niveau B s'ajoutent le texte rédigé des prompts, des résultats d'outils,
des chemins de fichiers et du contenu des modifications. Ce niveau n'est
admissible que dans l'une des trois hypothèses du §10 Al. 4.

(4) **Enveloppe rédigée.** Datagramme dont toutes les catégories de données
détectables (secrets, identifiants techniques, données personnelles de tiers
— noms, adresses électroniques, identifiants de ticket) ont été remplacées,
avant l'envoi, par des jetons déterministes, au moyen d'outils multiples de
détection et de substitution (TruffleHog, Gitleaks, règles Presidio).

(5) **Changement de niveau.** Tout passage du niveau B au niveau C est
soumis aux conditions cumulatives du §10 Al. 4 — en particulier la
signature cryptographique Ed25519 de la configuration, un délai de carence
de sept jours, la bannière d'information à chaque utilisateur et l'information
préalable du CSE.

---

### §7 Droits des salariés

(1) **Droit à l'information individuelle (Art. L1222-4).** Chaque salarié·e
visé·e par le Système reçoit, préalablement à toute collecte, une notice
individuelle (Partie C) décrivant : les finalités, les catégories de données
par niveau, les destinataires, la durée de conservation, l'existence de
droits d'accès, de rectification, d'effacement, de limitation et d'opposition,
ainsi que les modalités d'exercice de ces droits.

(2) **Droit d'accès, de portabilité et d'effacement (RGPD Art. 15, 17, 20).**
L'Employeur s'engage à un **délai de traitement de sept jours** à compter de
la réception d'une demande complète, plus court que le mois prévu à l'Art.
12(3) du RGPD. L'effacement est mis en œuvre par suppression atomique de la
partition de base de données associée et par exécution de la commande
`bematist erase`. La confirmation est notifiée par courrier électronique à
la personne concernée et tracée dans le journal d'audit.

(3) **Droit à la confidentialité vis-à-vis de la hiérarchie.** Le texte brut
des prompts d'un·e salarié·e n'est pas accessible à sa hiérarchie. Les seules
exceptions sont celles expressément énumérées au §10 Al. 4, toutes tracées
au journal d'audit. Les actions « Reveal » et « Export with prompts »
requièrent une authentification à deux facteurs et génèrent chacune une
entrée d'audit.

(4) **Droit au paramétrage par défaut.** Le Système fonctionne par défaut
au niveau B. Toute élévation au niveau C doit satisfaire aux conditions du
§10 Al. 4.

(5) **Droit à la traçabilité de l'accès.** Tout accès en lecture par un
membre de l'encadrement ou une personne administrativement habilitée aux
surfaces de restitution est inscrit au journal d'audit (`audit_log`) au
moment même de l'accès. Chaque salarié·e peut obtenir copie des entrées le
ou la concernant via la commande `bematist audit --my-accesses`.

(6) **Droit à la notification des consultations hiérarchiques.** Chaque
consultation d'une page nominative individualisée par un·e manager génère
une écriture synchrone dans le journal `audit_events` (Décision D30). La
personne concernée reçoit par défaut une synthèse quotidienne ; la
notification immédiate est optionnelle via la page `/me/notifications`. La
désactivation de cette notification est permise mais la transparence reste
le paramétrage par défaut ; elle n'est ni tarifée ni conditionnée à une
option payante.

(7) **Droit d'opposition sans préjudice.** L'exercice par un·e salarié·e de
ses droits au titre de la présente consultation (en particulier : opposition
à l'activation du niveau C projet par projet au titre du §10 Al. 4 lit. a)
ne peut donner lieu à aucune mesure défavorable en matière d'emploi, de
rémunération, d'évolution de carrière ou d'affectation.

(8) **Droit à l'information relative au journal de sortie.** Chaque
salarié·e peut consulter à tout moment le journal de sortie local au moyen
de la commande `bematist audit --tail` et constater quelles données ont
quitté son poste.

---

### §8 Mesures techniques et organisationnelles

(1) **Rédaction côté serveur (autoritaire).** La rédaction des événements
est imposée par le serveur d'ingestion. Le Système met en œuvre au minimum
TruffleHog, Gitleaks et les jeux de règles Presidio. Les secrets et
données personnelles de tiers détectés sont remplacés par des jetons
déterministes. La rédaction côté poste constitue une défense en profondeur
supplémentaire ; la couche serveur reste autoritaire.

(2) **Liste d'autorisation `raw_attrs`.** Pour les niveaux A et B, une
liste limitative des attributs techniques transmissibles est appliquée à
l'ingestion. Toute tentative de transmission d'un attribut hors liste est
rejetée par le serveur (HTTP 400).

(3) **Isolation du locataire.** Les tables de la base de contrôle sont
protégées par une politique de sécurité au niveau ligne (RLS) ; la sonde
de fuite inter-locataire (INT9) retourne zéro ligne en intégration continue.
Le stockage événementiel est partitionné par
`(tenant_id, engineer_id, day)`, ce qui rend l'effacement atomique (`DROP
PARTITION`) et non rejouable.

(4) **Pseudonymisation des agrégats.** Les agrégats conservés à durée
indéterminée sont pseudonymisés par une dérivation propre au locataire
(`HMAC(engineer_id, tenant_salt)`), excluant toute jonction inter-
locataire. Cette pseudonymisation fonde la conservation des agrégats au
titre de la carve-out Art. 17(3)(e) RGPD (finalités statistiques).

(5) **Pipeline embarqué (Clio-adapted).** Avant tout envoi, un pipeline
s'exécute localement sur le poste : rédaction des secrets (TruffleHog,
Gitleaks) et des données personnelles (Presidio) ; abstraction
exclusivement par un LLM local (MCP vers l'agent Claude Code ou Codex
local de l'utilisateur ; à défaut, Ollama Qwen 2.5-7B local) ; vérification
de l'absence de contenu identifiant ; embedding local (Xenova MiniLM-L6).
**Aucun LLM en nuage n'est appelé sur du contenu brut.** Le texte brut du
prompt ne quitte jamais le poste sauf dans les hypothèses du §10 Al. 4.

(6) **Changement de niveau — signature Ed25519 et délai de carence.** Tout
changement tenant-wide du niveau par défaut est subordonné à la signature
cryptographique Ed25519 du fichier de configuration par un gestionnaire
habilité, à un **délai de carence de sept jours** entre la signature et la
prise d'effet, à l'affichage d'une bannière d'information dans
l'environnement de développement de chaque salarié·e concerné·e pendant
le délai, et à **l'information préalable écrite du CSE** au plus tard au
début du délai de carence.

(7) **Journalisation en annexe inviolable.** Les journaux d'audit
(`audit_log`, `audit_events`) sont stockés en mode ajout-seul au niveau de
la base de données (retrait des privilèges `UPDATE`, `DELETE`). Leur
conservation est indéfinie, sous réserve de demandes d'effacement au titre
du RGPD Art. 17 et en l'absence de motif impérieux de conservation.

(8) **Allowlist d'égresse.** Le collecteur supporte le drapeau
`--ingest-only-to` avec épinglage de certificat TLS, de sorte qu'un
binaire compromis ou substitué ne peut pas exfiltrer les données vers une
destination contrôlée par un tiers.

(9) **Absence de cliché de plantage.** La génération de clichés de
plantage (core dump) est désactivée par configuration (`ulimit -c 0`,
`RLIMIT_CORE=0`). La commande `bematist doctor` vérifie cette contrainte.

---

### §9 Durées de conservation

(1) Les **événements bruts** sont conservés comme suit :

a) **Niveau A :** 90 jours calendaires, supprimés par suppression atomique
   de partition (la conservation par TTL est proscrite pour ce niveau) ;

b) **Niveau B (par défaut) :** 90 jours calendaires, supprimés par
   suppression atomique de partition ;

c) **Niveau C (si activé) :** 30 jours calendaires, supprimés par
   suppression atomique de partition ; le TTL reste admissible en
   complément.

(2) Les **agrégats post-rollup** sont conservés à durée indéterminée, mais
exclusivement sous forme pseudonymisée au sens du §8 Al. 4.

(3) Les **journaux d'audit** (`audit_log`, `audit_events`) sont conservés à
durée indéterminée sous réserve du RGPD Art. 17 et des droits reconnus au §7.

(4) Les **demandes d'effacement** sont instruites en sept jours calendaires
au plus ; leur traitement est tracé au journal d'audit.

---

### §10 Protection des données personnelles (RGPD)

(1) **Principes de traitement.** Licéité, finalité déterminée, minimisation,
exactitude, limitation de conservation, intégrité et confidentialité
(RGPD Art. 5). Fondements : RGPD Art. 6(1)(b) (exécution du contrat, pour
les traitements strictement nécessaires à la relation) ; RGPD Art. 6(1)(f)
(intérêt légitime, pour les finalités pilotage et fiabilité, après test
d'équilibre documenté — cf. AIPD en annexe 2). Le consentement n'est pas
retenu.

(2) **Obligations d'information (Art. 12–14).** Satisfaites par la
publication de la « Bill of Rights » (page `/privacy`), par la présente
consultation et son annexe « Notice individuelle » (Partie C).

(3) **Droits des personnes (Art. 15 à 22).** Mis en œuvre conformément au
§7 ; délai de traitement de sept jours pour les demandes d'accès,
d'effacement et de portabilité, plus court que le mois de l'Art. 12(3).

(4) **Niveau C — conditions cumulatives d'admissibilité.** Le traitement
au niveau C n'est admissible que dans l'une des trois hypothèses
ci-dessous, toutes consignées au journal d'audit :

a) **Consentement projet par projet.** Le ou la salarié·e consent
   expressément, de manière éclairée et à tout moment révocable, à
   l'élévation au niveau C pour un projet précis. La révocation produit
   effet immédiat. Aucun désavantage professionnel ne peut en résulter
   (§7 Al. 7).

b) **Activation tenant-wide par l'administration.** L'administration
   active le niveau C à l'échelle du locataire, sous les conditions
   cumulatives suivantes :

   - la configuration est signée au moyen d'une clef Ed25519 ;
   - un délai de carence de sept jours s'écoule entre la signature et
     la prise d'effet ;
   - une bannière est affichée dans l'environnement de développement de
     chaque salarié·e concerné·e avant la prise d'effet ;
   - **le CSE est informé par écrit au plus tard au début du délai de
     carence** et reçoit la faculté de présenter ses observations
     pendant ce délai.

c) **Rétention contentieuse (« legal hold »).** Une rétention nommément
   désignée, temporellement limitée et motivée juridiquement est activée
   par un compte de rôle « Auditeur ». La mesure fait l'objet d'une
   documentation et d'une motivation et est notifiée au CSE dans le
   respect des obligations éventuelles de confidentialité.

(5) **AIPD.** Une analyse d'impact relative à la protection des données
(RGPD Art. 35) est réalisée préalablement à la mise en production. Le DPO
({{DPO_EMAIL}}) et, pour avis, le CSE sont associés. Un modèle d'AIPD est
fourni en annexe 2 ; la responsabilité du contenu incombe à l'Employeur.

(6) **Sous-traitance (Art. 28).** Toute sous-traitance s'effectue sur la
base d'un contrat écrit conforme à l'Art. 28 du RGPD. La liste des
sous-traitants figure en annexe 3.

(7) **Transferts hors UE.** Tout transfert hors UE (en particulier dans
l'option « cloud géré » avec recours à des sous-traitants situés aux
États-Unis) est encadré par les Clauses contractuelles types 2021/914
Module 2 et, le cas échéant, par l'auto-certification au DPF. Un TIA est
versé au dossier (`legal/review/SCCs-module-2.md`).

---

### §11 Droits et prérogatives du CSE

(1) **Expertise libre.** Le CSE peut recourir à un expert habilité en
application des articles L2315-78 à L2315-91, en particulier à l'expert
« nouvelle technologie » (L2315-94). Les frais sont pris en charge selon
les règles légales. L'Employeur fournit à l'expert l'ensemble des
informations et justificatifs utiles, y compris les accès nécessaires aux
journaux d'audit en lecture et aux règles de rédaction
(`packages/redact`).

(2) **Observatoire paritaire technologique (optionnel, cf. Partie B).**
Les Parties conviennent, dans le cadre de l'accord de méthode Groupe
Alpha, de constituer une commission technologique paritaire, avec mandat
explicite sur le Système, qui se réunit à cadence trimestrielle.

(3) **Revue trimestrielle obligatoire.** Indépendamment de la commission
paritaire, les Parties organisent chaque trimestre une revue commune
portant sur le respect des finalités (§4), le respect des planchers de
k-anonymité (§5 Al. 4), les exceptions du §10 Al. 4 activées, l'évolution
des délais d'effacement, et toute modification de la configuration ou de
la version logicielle.

(4) **Information préalable aux changements substantiels.** Toute
modification du paramétrage affectant le niveau, les règles de rédaction,
les durées de conservation ou l'interface de gestion fait l'objet d'une
information écrite préalable au CSE avant prise d'effet. Le délai de
carence du §10 Al. 4 lit. b s'applique à tout changement tenant-wide de
niveau.

(5) **Accès aux données agrégées du journal d'accès.** Le CSE reçoit, sur
demande, des restitutions agrégées et anonymisées du journal `audit_events`
permettant d'apprécier l'ampleur des consultations hiérarchiques
nominatives. Le CSE n'accède pas aux données d'événement individuelles
(§11 Al. 6 ci-après).

(6) **Non-accès aux événements nominatifs.** Par souci de proportionnalité
et de finalité, le CSE n'a pas accès aux événements bruts individuels.
Les données nécessaires à l'exercice de ses attributions collectives lui
sont fournies sous forme agrégée.

(7) **Questionnaire anonyme post-déploiement.** À l'issue des phases prévues
à l'accord de méthode (Partie B), un questionnaire anonyme est adressé à
l'ensemble des salarié·e·s concerné·e·s ; la synthèse est présentée à la
commission paritaire et au CSE.

---

### §12 Calendrier de consultation et délais

(1) Le CSE dispose, à compter de la communication du présent dossier et de
ses annexes, d'un **délai de consultation d'un mois** (Art. R2312-6 Al. 1),
porté à deux mois en cas de recours à un expert ou à trois mois en
présence de CSE central et d'établissement, conformément au droit commun.
Le silence à l'expiration du délai vaut avis.

(2) L'Employeur s'engage à ne pas mettre en œuvre le Système avant que
l'avis du CSE soit rendu ou que le délai légal soit expiré. Aucun envoi
de donnée vers l'ingestion n'est effectué pendant cette période.

(3) Un calendrier détaillé est proposé en annexe 4 ; il précise en
particulier les dates de remise du dossier, des réunions, du recours à
expertise et de la délibération.

---

### §13 Résolution des différends

(1) Tout désaccord sur l'interprétation ou l'application du présent
dossier et, le cas échéant, de l'accord de méthode, fait l'objet d'une
tentative de conciliation entre les Parties.

(2) À défaut d'accord, les voies de recours du Code du travail sont
ouvertes, y compris la saisine du juge des référés (TJ compétent) ; les
Parties rappellent la jurisprudence TJ Nanterre 29 janvier 2026 et TJ
Paris 2 septembre 2025 (France Télévisions) qui confirment la compétence
du juge des référés sur le fondement de L2312-38.

(3) Le CSE conserve tout droit de saisine auprès de la CNIL et, le cas
échéant, auprès de l'Inspection du travail ou de toute autorité
compétente.

(4) Le contact fournisseur pour toute escalade technique est
{{CONTACT_ESCALADE}}. Ce contact ne crée aucune relation contractuelle
directe entre le CSE et le fournisseur du Système.

---

## Partie B — Projet d'accord de méthode (modèle Groupe Alpha 15 déc. 2025)

### §1 Cadre

(1) Les Parties, dans le prolongement de la consultation en Partie A,
concluent un **accord de méthode** inspiré de l'accord Groupe Alpha
15 décembre 2025, décomposant le déploiement du Système en trois phases
successives, chacune conditionnant la suivante.

(2) Le présent accord est négocié et signé dans le délai de consultation
du §12 Partie A. Sa conclusion vaut avis favorable au titre de L2312-38,
sous réserve du respect des phases et conditions ci-après.

### §2 Phase 1 — Information

(1) Durée : 30 jours calendaires à compter de la signature.

(2) L'Employeur fournit au CSE et à la commission paritaire technologique
(§3) l'ensemble des éléments du §3 Partie A, complétés de :

a) la description détaillée des finalités et des cas d'usage ;
b) la liste des établissements et des populations concernées ;
c) le projet de notice individuelle (Partie C) ;
d) l'AIPD préliminaire.

(3) Aucun flux de donnée n'est émis pendant cette phase.

### §3 Phase 2 — Expérimentation

(1) Durée : 90 jours calendaires au plus.

(2) L'expérimentation couvre un périmètre restreint, validé par la
commission paritaire, n'excédant pas {{SEUIL_EXPERIMENTATION}} salarié·e·s.
Les règles énoncées à la Partie A (et notamment le niveau B par défaut,
les planchers de k-anonymité, le §7, le §10, le §11) s'appliquent
intégralement à la phase d'expérimentation.

(3) **Rappel jurisprudentiel.** Conformément à TJ Nanterre 29 janvier
2026 et TJ Paris 2 septembre 2025 (France Télévisions), la phase
d'expérimentation n'exonère pas de la consultation préalable : elle est
couverte par la présente consultation. Tout élargissement de périmètre
en cours d'expérimentation suppose une consultation complémentaire du
CSE.

(4) Les salarié·e·s participant à l'expérimentation peuvent à tout
moment se retirer sans justification et sans préjudice.

### §4 Phase 3 — Diagnostic

(1) Durée : 30 jours calendaires après la fin de l'expérimentation.

(2) La commission paritaire dresse un diagnostic à partir :

a) des agrégats techniques collectés en phase 2 ;
b) des avis du DPO ({{DPO_EMAIL}}) ;
c) du **questionnaire anonyme** adressé à l'ensemble des salarié·e·s
   concerné·e·s, dont la synthèse est présentée au CSE ;
d) du relevé d'incidents le cas échéant.

(3) À l'issue du diagnostic, le CSE émet un avis sur la généralisation.
En cas d'avis favorable, le Système passe en production ; en cas d'avis
défavorable, l'Employeur ne peut généraliser qu'après négociation
complémentaire.

### §5 Commission paritaire technologique

(1) Composition : nombre paritaire de représentant·e·s de l'Employeur
(dont le DPO) et du CSE (dont au moins un·e titulaire), avec voix
consultative pour l'expert habilité.

(2) Mandat : suivre les phases 1 à 3, émettre des avis, alerter en cas
de dérive, et surveiller l'évolution du Système après généralisation.

(3) Cadence : mensuelle en phases 1 à 3, trimestrielle ensuite (en
coordination avec §11 Al. 3 Partie A).

### §6 Dispositions générales

(1) Modification. Le présent accord de méthode ne peut être modifié que
par avenant conclu dans les mêmes formes.

(2) Durée. L'accord de méthode est conclu pour la durée des trois phases
et se proroge ensuite jusqu'à dénonciation.

(3) Dénonciation. Chaque Partie peut dénoncer l'accord de méthode avec un
préavis de trois mois.

---

## Partie C — Notice individuelle d'information (Art. L1222-4)

> *À distribuer à chaque salarié·e concerné·e avant toute collecte — en
> complément de la consultation du CSE (Partie A) et, le cas échéant, de
> l'accord de méthode (Partie B). Forme libre ; la présente notice est un
> modèle rédactionnel.*

---

**À l'attention de {{PRENOM_NOM_SALARIE}}**

**Objet : information préalable à la mise en œuvre d'un dispositif
d'analyse des outils de développement assistés par IA**

{{EMPLOYEUR}}, en qualité de responsable de traitement, vous informe, en
application de l'article L1222-4 du Code du travail et des articles 13 et
14 du Règlement général sur la protection des données (RGPD), de la mise
en œuvre, à compter du {{DATE_EFFET}}, du système « Bema » sur votre
poste de travail ou dans votre environnement de développement.

**1. Finalités.** Le système collecte des données d'utilisation des outils
de développement assistés par IA que vous employez (notamment Claude Code,
Codex, Cursor, Continue.dev, GitHub Copilot). Les finalités poursuivies
sont strictement :

- le pilotage du budget associé à ces outils (analyse de coût au niveau
  collectif) ;
- l'analyse de fiabilité des outils (taux d'erreur, taux de relance) ;
- l'analyse agrégée de motifs d'usage au niveau de l'équipe.

**Le système n'est pas utilisé pour évaluer votre performance
individuelle,** ni pour prendre une décision de rémunération, d'avancement,
de mutation, de licenciement, ni pour établir un classement individuel.
Aucune décision individuelle produisant des effets juridiques ou
significativement similaires n'est prise sur la base exclusive du système
(RGPD Art. 22).

**2. Catégories de données.** Par défaut, le système fonctionne au
**niveau B** : il transmet des compteurs numériques (nombre de sessions,
tokens, coût, durée, longueur de prompt) et des enveloppes d'événements
rédigées (types d'événement, chemins de fichier hachés, classe d'erreur).
**Le texte de vos prompts ne quitte pas votre poste dans ce paramétrage.**
Un niveau supérieur (C, incluant le texte des prompts) ne peut être activé
que dans trois hypothèses strictement encadrées (consentement de votre
part projet par projet ; activation tenant-wide avec préavis et bannière ;
rétention contentieuse) ; vous en serez informé·e par une bannière dans
votre environnement de développement avant prise d'effet.

**3. Destinataires.** Les données sont accessibles à des rôles
limitativement définis : vous-même (accès à vos propres données) ; votre
responsable d'équipe et vos manageurs (agrégats uniquement, sauf les trois
exceptions ci-dessus qui sont tracées) ; les administrateurs (configuration
et journaux d'audit, sans accès au texte des prompts) ; un·e auditeur·trice
(journaux d'audit uniquement).

**4. Durée de conservation.** 90 jours pour les événements bruts au
niveau A et B ; 30 jours au niveau C ; durée indéterminée pour les
agrégats pseudonymisés.

**5. Vos droits.** Vous disposez des droits d'accès, de rectification,
d'effacement, de limitation, d'opposition et de portabilité (RGPD Art. 15
à 22) :

- **Accès et portabilité :** via la commande `bematist export` ou par
  demande écrite à {{DPO_EMAIL}}.
- **Effacement :** via la commande `bematist erase` ou par demande écrite ;
  l'Employeur s'engage à traiter votre demande en sept jours calendaires
  au plus.
- **Consultation de ce qui a quitté votre poste :** via la commande
  `bematist audit --tail`.
- **Consultation des accès hiérarchiques à vos données :** via la commande
  `bematist audit --my-accesses`. Vous recevez par ailleurs une synthèse
  quotidienne des consultations hiérarchiques ; vous pouvez opter pour
  une notification immédiate via la page `/me/notifications`.
- **Opposition au niveau C projet par projet (si activé par
  consentement).**

L'exercice de ces droits n'entraîne aucune mesure défavorable à votre
encontre.

**6. Réclamation.** Vous pouvez adresser toute réclamation au DPO
({{DPO_EMAIL}}) et, à tout moment, introduire une réclamation auprès de
la Commission nationale de l'informatique et des libertés (CNIL).

**7. Consultation du CSE.** Le présent dispositif a fait l'objet d'une
consultation du Comité Social et Économique le {{DATE_CSE}}. Un exemplaire
du dossier de consultation est à votre disposition sur {{URL_INTRANET}}.

Fait à {{LIEU}}, le {{DATE}}.

Pour {{EMPLOYEUR}} — {{NOM_SIGNATAIRE}}, {{FONCTION_SIGNATAIRE}}.

---

## §14 Annexes

- **Annexe 1 :** Schéma de flux technique du Système.
- **Annexe 2 :** Modèle d'AIPD (`legal/review/DPIA.md`).
- **Annexe 3 :** Liste des sous-traitants et flux hors UE (le cas
  échéant, `legal/review/SCCs-module-2.md`).
- **Annexe 4 :** Calendrier de consultation.
- **Annexe 5 :** Bill of Rights et rider contractuel
  (`legal/review/bill-of-rights-rider.md`).
- **Annexe 6 :** Spécification technique du journal `audit_events` et des
  règles de rédaction (`contracts/09-storage-schema.md`,
  `packages/redact/`).

---

## §15 Signatures

Fait à {{LIEU}}, le {{DATE}}, en deux exemplaires.

**Pour l'Employeur :**

{{EMPLOYEUR}}

________________________________________________
(Signature, nom et fonction)

**Pour le Comité Social et Économique :**

{{CSE_TITULAIRES}}

________________________________________________
(Signature et nom)

---

<!--
================================================================================
 ENGLISH FOOTER — for Workstream I owner (Sandesh) + FR-qualified counsel
================================================================================

**FR-counsel review checklist (mandatory before execution with any customer).**

1. Verify the L2312-38 framing in §1 Al. 1 against current Cass. soc. and TJ
   référé case law on "décision de mettre en œuvre" timing. Confirm TJ
   Nanterre 29 janvier 2026 ordonnance is final / not appealed; if appealed,
   update footer with current status.
2. Confirm the L1222-4 notice (Part C) satisfies CNIL référentiel gestion du
   personnel (Mars 2019) + 2023–2025 CNIL IA-au-travail stream.
3. Validate the Metlife Europe June 2025 red-lines in §4 Al. 3 b)–c) against
   the actual (non-public) accord text; counsel may propose stronger
   formulations. Confirm "human-in-the-loop" phrasing aligns with Art. 22
   RGPD + LIL Art. 47.
4. Confirm §10 Al. 4 lit. b (Ed25519 + 7-day cooldown + IC banner + CSE
   information préalable "au plus tard au début du délai de carence") provides
   *meaningful participation* for the CSE, not merely formal notice — and
   does not collide with the one-month L2312-38 delay.
5. Validate §11 Al. 1 (expertise L2315-78 à L2315-91) — confirm scope of
   employer-funded expert and access to `packages/redact` source code as a
   "justificatif utile" under current case law.
6. Validate Part B (accord de méthode) against Groupe Alpha 15 déc. 2025
   structure. Confirm the three-phase model is binding when embedded in an
   accord and not merely a negotiation choreography.
7. Validate Part C (notice individuelle) against CNIL enforcement actions
   2023–2025 on workplace monitoring notices. The notice must be delivered
   on paper or durable support, not just intranet.
8. Confirm §12 (consultation timeline) reflects current Art. R2312-6 text
   (one / two / three months) and the CSE central / établissement
   articulation in §2 Al. 3. Confirm that expert resort extends the
   consultation delay and that the expert is paid under L2315-80.
9. Check whether the customer has a "Commission Santé Sécurité et
   Conditions de Travail" (CSSCT) — if so, §11 Al. 2 commission technologique
   may overlap; clarify distinct mandate.
10. Confirm all placeholders (`{{EMPLOYEUR}}`, `{{CSE_TITULAIRES}}`, etc.)
    are replaced before execution.

**Counsel-priority sections (phrasing authored by non-FR-qualified drafter).**

- §1 Al. 3 — "jurisprudence TJ Nanterre 29 janvier 2026" is load-bearing per
  CR-10; counsel to confirm the ordonnance is citable and has not been
  overturned. If overturned, substitute TJ Paris 2 septembre 2025 (France
  Télévisions) as primary authority.
- §4 Al. 3 lit. a–c — red-lines Metlife Europe June 2025: verify wording
  against the real accord (paywalled / non-public); counsel may propose
  softening ("notamment" rather than closed list) or strengthening
  ("exclusivement humaines").
- §5 Al. 1 — prohibition clause "contrôle de performance ou comportement"
  drafted analogously to the DE verbatim clause; confirm enforceability
  under L1121-1 proportionality + Art. 88 RGPD in FR context.
- §7 Al. 7 — "aucune mesure défavorable" relative to L1132-1 and
  L2281-1 protections; confirm enforceable before the Conseil de
  prud'hommes.
- §10 Al. 1 — lawful-basis chain (Art. 6(1)(b) + Art. 6(1)(f) + balancing
  via DPIA) to be stress-tested against LIL Art. 32 and CNIL guidance.
- §12 Al. 1 — 1 / 2 / 3 months delay: confirm against current R2312-6
  text (has been revised several times post-2017 ordonnances Macron).
- Part B §3 Al. 3 — TJ Nanterre pilot-exemption closure is load-bearing per
  CR-10; confirm citation format and anonymization if the ordonnance is not
  yet published in full.
- Part C — L1222-4 notice individuelle: confirm delivery medium, timing
  ("avant toute collecte"), and content list (purposes / categories /
  recipients / retention / rights / DPO contact / CNIL recourse).

**Verbatim-citation audit (per compliance PRD §11.1 CR-10 + §5 FR row).**

The four load-bearing FR anchors required by the brief are cited as follows:

- **Groupe Alpha method agreement (15 Dec 2025)** — Part B "modèle Groupe
  Alpha 15 déc. 2025" + §§2–5 three-phase (Information / Expérimentation /
  Diagnostic) + §5 commission paritaire technologique + §4 Al. 2 lit. c
  questionnaire anonyme post-deploy. Cited 2× in this file.
- **Metlife Europe red-lines (June 2025)** — §4 Al. 3 lit. a (no
  AI-only redundancy); lit. b (closed loophole); lit. c (AI excluded from
  pay / career HR decisions, human-in-the-loop mandatory). Cited 3× in this
  file.
- **TJ Nanterre, 29 janvier 2026** — §1 Al. 3 (pilot-not-exempt clause,
  verbatim authority); §13 Al. 2 (référé jurisdiction); Part B §3 Al. 3
  (expérimentation non-exemption). Cited 3× in this file.
- **TJ Paris, 2 septembre 2025 (France Télévisions)** — §1 Al. 3
  (corroborating authority for L2312-38 timing); §13 Al. 2 (référé
  jurisdiction, corroborating). Cited 2× in this file.

**Changelog.**

- 2026-04-17 — Initial template draft (Workstream I A13, Sprint 1 Week 2).
  Covers L2312-38 + L2312-8 4° + L1222-4 + RGPD Art. 88 + LIL Art. 32 +
  L1121-1 proportionality. Bundles three instruments (dossier de
  consultation + projet d'accord de méthode + notice L1222-4) for review
  convenience; counsel may split. Awaiting FR-counsel review per
  compliance PRD §10.1.

**Cross-references.**

- `dev-docs/workstreams/i-compliance-prd.md` §5 FR row + §11.1 OQ-1 + CR-10.
- `legal/review/works-agreement-DE.md` — parallel instrument for DE
  workforce (non-substituting).
- `legal/review/union-agreement-IT.md` — parallel instrument for IT
  workforce.
- `legal/review/DPIA.md` — AIPD annexée.
- `legal/review/SCCs-module-2.md` — transferts hors UE.
- `legal/review/bill-of-rights-rider.md` — rider contractuel.
- `CLAUDE.md` §Compliance Rules, §Privacy Model Rules, §Security Rules.

================================================================================
-->
