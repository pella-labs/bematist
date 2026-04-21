<!--
================================================================================
 ENGLISH PREAMBLE — navigation aid for non-Italian readers
================================================================================

**File:** `legal/review/union-agreement-IT.md` — Italian *accordo sindacale*
template per Statuto dei Lavoratori Art. 4 (as amended by D.Lgs. 151/2015 and
subsequent jurisprudence) for a Bema deployment in an Italian
establishment. Authoritative body in Italian below; this preamble is advisory
and non-binding. Owner: Workstream I (Compliance).

**STATUS: TEMPLATE — requires IT-qualified labour-and-data-protection counsel
review before use with any customer. Do NOT ship without external counsel
sign-off.**

**Who uses this file.** The customer's `{{DATORE_DI_LAVORO}}` (employer) and
the `{{RSU_O_RSA}}` (RSU or RSA — *rappresentanze sindacali*) execute this
*accordo sindacale*. Bema (the vendor) does NOT sign — the parties are
the employer and the union representatives. Vendor commitments live in a
separate DPA (Phase 2). Where no agreement is reached, authorization is
sought from the *Ispettorato Nazionale del Lavoro* (INL) per Art. 4 c. 1.

**Statutory triggers.**

- **Statuto dei Lavoratori Art. 4 c. 1 (L. 300/1970, as amended by D.Lgs.
  151/2015 and D.Lgs. 185/2016)** — installation of audiovisual equipment
  and other instruments from which a possibility of remote control of
  workers' activity can derive ("dai quali derivi anche la possibilità di
  controllo a distanza dell'attività dei lavoratori") is permitted only for
  organizational and production needs, work safety, or asset protection,
  and only after a prior *accordo collettivo* with the RSU/RSA or, failing
  that, INL authorization. Bema's productivity-capture profile falls
  squarely within this comma per CLAUDE.md and CR-9.
- **Statuto dei Lavoratori Art. 4 c. 2** — exception for "strumenti
  utilizzati dal lavoratore per rendere la prestazione lavorativa" (work
  tools) and access-control / time-tracking devices. **Cassazione,
  sez. lav., sent. n. 28365/2025** has narrowed this exception: a system
  whose principal purpose is monitoring productivity does NOT fall within
  the comma 2 work-tool exception even if installed on a work device —
  comma 1 procedure (*accordo* or INL authorization) applies. This is the
  *strumento-di-lavoro c. 2 trap* per the brief; cited verbatim in §1 c. 4
  below.
- **Statuto dei Lavoratori Art. 4 c. 3** — collected data may be used for
  all purposes connected with the employment relationship only if the
  worker has been adequately informed of the modalities of use and
  controls and in compliance with GDPR.
- **D.Lgs. 196/2003 (Codice Privacy) as amended by D.Lgs. 101/2018** —
  national implementation of GDPR; integrates Art. 4 SdL.
- **GDPR Art. 88 + Garante per la protezione dei dati personali Provv.
  364/2024 (5 dicembre 2024) — "Programmi e servizi informatici di
  gestione della posta elettronica nel contesto lavorativo"** — fixes a
  **21-day metadata retention ceiling** for workplace e-mail metadata
  absent specific *accordo sindacale* / INL authorization for longer
  periods. The Garante extends this reasoning by analogy to other
  productivity-capture systems; per CR-9, Bema defaults (90d Tier-A,
  90d Tier-B, 30d Tier-C) exceed this ceiling and therefore mandate
  *accordo sindacale* on retention. Cited verbatim at §9 c. 2 below.
- **Garante Provv. 9 marzo 2023 ("Provvedimento Lazio")** + general
  guidance on workplace monitoring; *informativa* requirements.

**Load-bearing exemplar (per CR-9 + brief).**

- **Accordo GSK–ViiV Healthcare con RSU del 28 luglio 2025** — bipartite
  *osservatorio* + on-device anonymization + retention cap + explicit
  Art. 4 c. 1 compliance + opt-out without retaliation. Structural
  template for §§5, 11, 12 below. Note: full accordo text is not public;
  citations follow Lavorosi / Il Sole 24 Ore secondary reporting and
  CGIL/FILCAMS communiqués (per compliance PRD §11.1, gap E-4).

**Placeholders (replace before execution).**

- `{{DATORE_DI_LAVORO}}` — employer legal name and codice fiscale.
- `{{RSU_O_RSA}}` — names of RSU members or RSA chair.
- `{{DATA_EFFETTO}}` — ISO date (YYYY-MM-DD).
- `{{VERSIONE_SOFTWARE}}` — Bema release tag.
- `{{ID_TENANT}}` — tenant identifier.
- `{{DPO_EMAIL}}` — customer DPO mailbox.
- `{{CONTATTO_ESCALATION}}` — vendor escalation contact.
- `{{UNITA_PRODUTTIVE}}` — Italian establishments covered.

**Lane boundary.** Owned solely by Workstream I. Product-side controls
(`bematist audit --tail`, `audit_events`, `bematist erase`, Tier B default,
Ed25519 tier flip) are cited as descriptive of the shipped product per
CLAUDE.md and PRD §5–§8 — not redesigned here.

**On the 21-day retention conflict (CR-9, HIGH).** Bema defaults
(90 / 90 / 30 days) exceed the Garante 21-day ceiling. Three resolution
options were identified in compliance PRD §13 CR-9: (A) IT tenants default
to 21d raw retention; (B) gate IT go-live on signed *accordo sindacale*
for any longer retention; (C) document as customer-choice. This template
takes the conservative path: §9 c. 1 sets the **default at 21 calendar
days** for IT deployments and §9 c. 4 expressly subordinates any longer
retention to the *accordo sindacale* prevailing here (Art. 4 c. 1 SdL +
Garante Provv. 364/2024). The product-side decision (CW-5 in compliance
PRD §8) belongs to Sebastian + Jorge — this template binds the customer
contractually pending that decision and clearly flags the gap.

================================================================================
-->

# Accordo sindacale per l'installazione e l'uso del sistema Bema

**tra**

{{DATORE_DI_LAVORO}} — di seguito il "Datore di lavoro" —

**e**

la Rappresentanza Sindacale Unitaria (RSU) ovvero le Rappresentanze Sindacali
Aziendali (RSA), rappresentate da {{RSU_O_RSA}} — di seguito le "Rappresentanze
Sindacali" —

congiuntamente, le "Parti".

**In vigore dal:** {{DATA_EFFETTO}}
**Versione software:** {{VERSIONE_SOFTWARE}}
**Identificativo tenant:** {{ID_TENANT}}
**Unità produttive coperte:** {{UNITA_PRODUTTIVE}}

---

## §1 Premessa e qualificazione

(1) Il Datore di lavoro intende installare e utilizzare, nelle unità
produttive di cui sopra, il sistema "Bema" (di seguito il "Sistema") per
la rilevazione, l'aggregazione e la restituzione di dati di utilizzo degli
strumenti di sviluppo software assistiti da intelligenza artificiale
(in particolare Claude Code, Codex, Cursor, Continue.dev, GitHub Copilot e
strumenti analoghi).

(2) Le Parti danno atto che il Sistema è suscettibile di consentire — anche
indirettamente — il controllo a distanza dell'attività dei lavoratori
("attitudine al controllo"). La qualificazione opera oggettivamente, a
prescindere dall'intenzione del Datore di lavoro (Cass. sez. lav. costante;
EDPB Op. 2/2017).

(3) Il Sistema rientra pertanto nell'ambito dell'**art. 4 c. 1 della Legge
20 maggio 1970, n. 300 (Statuto dei Lavoratori),** come modificato dall'art.
23 del D.Lgs. 14 settembre 2015, n. 151, e dal D.Lgs. 24 settembre 2016, n.
185. La sua installazione e il suo utilizzo sono pertanto subordinati al
presente *accordo collettivo* sottoscritto con le Rappresentanze Sindacali
e, in difetto, all'autorizzazione dell'Ispettorato Nazionale del Lavoro (INL).

(4) Le Parti rilevano espressamente che **l'eccezione di cui all'art. 4 c. 2**
SdL (strumenti utilizzati dal lavoratore per rendere la prestazione lavorativa
e strumenti di registrazione degli accessi e delle presenze) **non si applica
al Sistema.** La Cassazione, sezione lavoro, sentenza n. 28365 del 2025, ha
chiarito che un sistema la cui finalità principale o effettiva è la
rilevazione di metriche di produttività non rientra nella deroga del comma 2,
ancorché installato sullo strumento di lavoro: la procedura del comma 1 è
sempre necessaria. Le Parti escludono pertanto qualsiasi tentativo di
qualificazione del Sistema come "strumento di lavoro" ai sensi del comma 2.

(5) Il Datore di lavoro riconosce che il Sistema è "idoneo al monitoraggio"
ai sensi della giurisprudenza dell'Unione (CGUE) e nazionale, e che la
presente disciplina si applica a prescindere dalla finalità soggettivamente
perseguita.

---

## §2 Ambito di applicazione

(1) **Ambito oggettivo.** Il presente accordo disciplina ogni operazione di
raccolta, trasmissione, conservazione, pseudonimizzazione, analisi e
cancellazione di dati prodotti dagli strumenti di sviluppo software assistiti
da IA utilizzati nelle unità produttive di cui in epigrafe.

(2) **Ambito soggettivo.** Sono interessati i lavoratori e le lavoratrici
titolari di rapporto di lavoro subordinato con il Datore di lavoro nelle
unità produttive coperte, le cui postazioni di lavoro o i cui accessi agli
ambienti di sviluppo siano oggetto di rilevazione. Sono altresì interessati,
nei limiti consentiti dalla legge e in via contrattuale, i lavoratori
parasubordinati e gli altri collaboratori che operino sulle medesime
postazioni.

(3) **Ambito territoriale.** Il presente accordo copre le unità produttive di
{{UNITA_PRODUTTIVE}}.

(4) **Esclusioni.** Sono escluse dall'ambito di applicazione le elaborazioni
strettamente locali alla postazione di lavoro che non lasciano la postazione
medesima (in particolare, le fasi locali di redazione e astrazione del
*pipeline* on-device descritto al §8 c. 5).

---

## §3 Definizioni

(1) **Livello di raccolta A — "solo contatori".** Il Sistema trasmette
unicamente metriche numeriche e metadati tecnici (identificatori di sessione
hashati, modello, timestamp, conteggio di token, costo, accettazioni e
rifiuti). Nessun contenuto di prompt, di input o di output di strumenti viene
trasmesso.

(2) **Livello di raccolta B — "contatori e involucri redatti" (impostazione
predefinita).** Ai dati del livello A si aggiungono involucri di evento
strutturalmente redatti: tipo di evento, percorsi di file hashati, classe di
errore, durata, lunghezza del prompt (non il contenuto), numero di righe
modificate (non il contenuto). Il testo grezzo del prompt o di una risposta di
strumento non viene trasmesso. **Questo è il livello predefinito del Sistema**
ai sensi della Decisione D7 del documento di prodotto.

(3) **Livello di raccolta C — "eventi completi con testo del prompt".** Ai
dati del livello B si aggiungono il testo redatto dei prompt, dei risultati
degli strumenti, dei percorsi dei file e del contenuto delle modifiche. È
ammesso solo nelle ipotesi del §10 c. 4.

(4) **Involucro redatto.** Datagramma dal quale, prima dell'invio, sono
rimossi e sostituiti con segnaposto deterministici tutti i segreti rilevati
(chiavi API, credenziali, token) nonché i dati personali di terzi (nomi,
indirizzi e-mail, identificativi di ticket), per mezzo di motori multipli di
rilevazione e sostituzione (TruffleHog, Gitleaks, regole Presidio).

(5) **AI Leverage Score.** Indicatore composito calcolato secondo l'algoritmo
versionato `ai_leverage_v1` (cinque sotto-componenti: Outcome Quality,
Efficiency, Autonomy, Adoption Depth, Team Impact). È esposto **esclusivamente
a livello di squadra o di aggregato** nell'interfaccia di gestione, nel
rispetto delle soglie di k-anonimato del §5 c. 4. Non è esposto come
classifica individuale né costituisce strumento di valutazione della
prestazione individuale.

(6) **Maturity Ladder.** Vista personale di auto-riflessione (livelli Aware,
Operator, Builder, Architect) accessibile esclusivamente al lavoratore o alla
lavoratrice nel proprio spazio coach individuale (`/me`). **Mai accessibile
alla linea gerarchica** e mai utilizzabile per qualunque decisione individuale
incidente sul rapporto di lavoro. L'attribuzione automatica di un livello a
fini decisionali è esclusa.

(7) **`audit_log`.** Registro append-only configurato a livello di base dati
mediante revoca dei privilegi `UPDATE` e `DELETE`; rileva ogni accesso in
lettura alle superfici di restituzione e ogni gesto di disvelamento.

(8) **`audit_events`.** Registro che memorizza ogni accesso individualizzato
("drill-down") di un *manager* alle pagine nominative di un lavoratore o di
una lavoratrice, contestualmente all'accesso. È la base tecnica della
trasparenza ex §7 c. 6.

(9) **Egress journal.** Registro locale alla postazione che traccia ogni
trasmissione in uscita del Sistema; consultabile dal lavoratore o dalla
lavoratrice mediante il comando `bematist audit --tail`.

(10) **Modifica di configurazione firmata.** Qualunque modifica del livello di
raccolta predefinito o di parametri di sicurezza è subordinata a una
configurazione firmata con chiave Ed25519, a un periodo di sospensione di
sette giorni e all'informazione preventiva delle Rappresentanze Sindacali
(§10 c. 4 lit. b).

(11) **Osservatorio paritetico.** Organismo bipartito istituito dal §11,
composto pariteticamente, con compito di sorveglianza e composizione
preventiva delle controversie. Modello: accordo GSK–ViiV Healthcare con RSU
del 28 luglio 2025.

---

## §4 Finalità autorizzate (art. 4 c. 1 SdL)

(1) Le sole finalità per le quali il Sistema può essere installato e
utilizzato sono **esigenze organizzative e produttive** ai sensi dell'art. 4
c. 1 SdL, declinate come segue:

a) **Pilotaggio della spesa (FinOps).** Analisi, a livello collettivo, dei
   costi indotti dall'uso degli strumenti di sviluppo assistiti da IA, ai
   fini della pianificazione di budget, della rilevazione di anomalie di
   costo e dell'individuazione aggregata di pattern di utilizzo
   inefficienti.

b) **Analisi di affidabilità.** Analisi, a livello aggregato, dell'affidabilità
   degli strumenti (tassi di errore, di ripetizione, abbandoni) e
   correlazione con risultati Git (pull request integrate, test verdi) ai
   fini del miglioramento della catena di strumenti e delle prassi
   tecniche.

c) **Analisi aggregata di squadra.** Restituzione di pattern di utilizzo a
   livello di squadra, nel rispetto delle soglie di k-anonimato del §5 c. 4.

d) **Condivisione controllata di pattern di lavoro ("playbooks"),**
   esclusivamente su iniziativa espressa, documentata e revocabile del
   lavoratore o della lavoratrice interessata. Nessuna pubblicazione
   automatica da parte del Sistema è ammessa.

(2) Qualunque uso del Sistema per finalità diverse da quelle di cui al c. 1
è inammissibile e costituisce inadempimento del presente accordo.

(3) **Esclusioni espresse.** Sono in particolare esclusi:

a) qualsiasi **valutazione della prestazione individuale** del lavoratore
   o della lavoratrice fondata sui dati del Sistema;

b) qualsiasi **provvedimento disciplinare** fondato in via principale o
   esclusiva sui dati del Sistema; resta salvo l'art. 4 c. 3 SdL nei limiti
   della corretta informazione preventiva al lavoratore;

c) qualsiasi **decisione individuale rilevante** (assunzione, trasferimento,
   promozione, retribuzione variabile, rinnovo) fondata sui dati del Sistema
   in via principale o esclusiva; ogni decisione che produce effetti
   giuridici o significativamente analoghi richiede intervento umano
   sostanziale (GDPR art. 22);

d) qualsiasi **classifica individuale,** ivi comprese liste di "migliori" o
   di "peggiori" lavoratori per indicatori di produttività;

e) qualsiasi **monitoraggio in tempo reale** dell'attività individuale, in
   particolare *live feed* di eventi a livello nominativo;

f) qualsiasi **intervento o blocco** automatico dell'attività del lavoratore
   o della lavoratrice.

(4) Le esclusioni del c. 3 sono assistite dai controlli tecnici di cui al §8
e dai diritti delle Rappresentanze Sindacali di cui al §11.

---

## §5 Divieto di controllo della prestazione e del comportamento

(1) Il Sistema **non può essere utilizzato per il controllo della prestazione
o del comportamento individuale dei lavoratori.** Tale divieto costituisce
oggetto specifico del presente accordo e del consenso sindacale prestato.

(2) Il divieto del c. 1 comprende in particolare:

a) la creazione di classifiche individuali per indicatori di produttività,
   qualità o efficienza, sia pubbliche sia accessibili alla linea
   gerarchica;

b) l'esposizione di indicatori di prestazione individuali (in particolare
   AI Leverage Score individuali) alla linea gerarchica; l'interfaccia di
   gestione mostra indicatori di prestazione **soltanto a livello aggregato**;

c) l'utilizzo dei dati del Sistema come fondamento **principale** o
   **esclusivo** di un atto di gestione del personale (cfr. §4 c. 3).

(3) **Matrice di accesso per ruolo.** L'accesso ai dati è ristretto come
segue:

| Ruolo | Livello A | Livello B (default) | Livello C |
|---|---|---|---|
| Lavoratore (sé) | Contatori propri | Contatori + involucri propri | Propri + testo del prompt proprio |
| Lavoratore (peer) | Solo aggregati di squadra | Idem | Idem |
| Capo squadra (Team Lead) | Aggregati + contatori per persona | + percorsi hashati per persona | + testo del prompt per persona *solo* se la persona vi ha consentito progetto per progetto |
| Manager | Aggregati di squadra e di organizzazione | Idem | Idem — **nessun testo del prompt nominativo** salvo *legal hold* |
| Amministratore | Configurazione + log di audit | Idem | Idem — **non legge il testo del prompt** (separazione dei ruoli) |
| Auditor | Solo log di audit | Idem | Idem |

(4) **Soglie di k-anonimato.** Ogni rappresentazione di squadra è esposta solo
se soddisfa le seguenti soglie; in mancanza, è oscurata e sostituita dalla
dicitura "Coorte insufficiente":

a) **k ≥ 5** per ogni *tile* di squadra; non è esposta se l'uscita di un
   singolo lavoratore (ferie, assenza) ne farebbe scendere la coorte sotto
   la soglia;

b) **k ≥ 3** quale contributo minimo per qualunque cluster di prompt;

c) **k ≥ 25** per pubblicazioni con rumore differenzialmente privato a
   partire dalla Phase 2.

(5) Un indicatore individuale è esposto al lavoratore solo se ricorrono
cumulativamente: (a) almeno dieci sessioni; (b) almeno cinque giorni attivi;
(c) almeno tre eventi di esito; (d) coorte di confronto di almeno otto pari.
In mancanza, l'indicatore è oscurato e sostituito dalla dicitura "Dati
insufficienti". È vietata l'approssimazione o l'interpolazione.

---

## §6 Diritti dei lavoratori e delle lavoratrici

(1) **Diritto all'informativa preventiva (art. 4 c. 3 SdL + GDPR art. 13).**
Prima di ogni raccolta, ciascun lavoratore o lavoratrice riceve
un'informativa scritta che indica: le finalità del trattamento; le categorie
di dati raccolti per ciascun livello; i destinatari; le durate di
conservazione; i diritti dell'interessato e le modalità di esercizio.
L'informativa è altresì resa disponibile sull'intranet aziendale.

(2) **Diritto di accesso, portabilità e cancellazione (GDPR Art. 15, 17, 20).**
Il Datore di lavoro si impegna a un **termine di evasione di sette giorni**
dal ricevimento di una richiesta completa, più breve del mese previsto
dall'art. 12(3) GDPR. La cancellazione è eseguita mediante eliminazione
atomica della partizione di base dati e mediante esecuzione del comando
`bematist erase`. La conferma è notificata all'interessato per posta
elettronica e tracciata nel registro di audit.

(3) **Diritto alla riservatezza nei confronti della linea gerarchica.** Il
testo grezzo dei prompt di un lavoratore non è accessibile alla sua linea
gerarchica. Sono ammesse soltanto le tre eccezioni del §10 c. 4, ciascuna
tracciata. Le azioni "Reveal" e "Export with prompts" richiedono
autenticazione a due fattori e generano una scrittura di audit.

(4) **Diritto al livello predefinito.** Il Sistema funziona per impostazione
predefinita al livello B. L'innalzamento al livello C è ammesso solo nelle
ipotesi del §10 c. 4.

(5) **Diritto alla tracciabilità degli accessi.** Ogni accesso in lettura ai
dati nominativi del lavoratore è registrato nel `audit_log` al momento
dell'accesso. Il lavoratore può ottenere copia delle registrazioni che lo
riguardano mediante il comando `bematist audit --my-accesses`.

(6) **Diritto alla notifica delle consultazioni gerarchiche.** Ciascuna
visualizzazione individualizzata della pagina di un lavoratore da parte di un
*manager* genera una scrittura sincrona nel registro `audit_events`
(Decisione D30). Il lavoratore riceve di default una sintesi quotidiana; può
optare per la notifica immediata via `/me/notifications`. La disattivazione
della notifica è consentita ma la trasparenza resta il default; non è una
funzione a pagamento.

(7) **Diritto all'opposizione senza ritorsioni.** L'esercizio dei diritti
qui riconosciuti (in particolare l'opposizione all'innalzamento al livello C
progetto per progetto ai sensi del §10 c. 4 lit. a) non può comportare alcuna
misura sfavorevole, ai sensi degli artt. 4, 8 e 15 SdL e dei principi
generali in materia di non discriminazione.

(8) **Diritto all'informazione sull'egress journal.** Il lavoratore può
consultare in ogni momento, mediante il comando `bematist audit --tail`, il
registro locale delle trasmissioni e verificare quali dati hanno lasciato la
sua postazione.

---

## §7 Tutele specifiche per la dignità del lavoratore (artt. 8 e 15 SdL)

(1) **Divieto di indagini su opinioni.** Il Datore di lavoro non utilizza il
Sistema per condurre indagini sulle opinioni politiche, religiose o sindacali
del lavoratore, né su fatti non rilevanti ai fini della valutazione
dell'attitudine professionale (art. 8 SdL).

(2) **Divieto di discriminazione.** Il Datore di lavoro non utilizza il
Sistema per atti discriminatori ai sensi dell'art. 15 SdL, né per
disincentivare l'attività sindacale.

(3) **Effetto sulla rappresentanza sindacale.** Il Datore di lavoro non
utilizza il Sistema per rilevare attività sindacale o partecipazione a
scioperi.

(4) **Tutela del *whistleblowing*.** Il Sistema non viene utilizzato per
identificare segnalanti di illeciti ai sensi del D.Lgs. 24/2023.

---

## §8 Misure tecniche e organizzative

(1) **Redazione lato server (autoritativa).** La redazione degli eventi è
imposta dal server di ingestione. Il Sistema impiega TruffleHog, Gitleaks e
le regole Presidio. Segreti e dati personali di terzi rilevati sono
sostituiti con segnaposto deterministici. La redazione lato postazione è una
difesa in profondità aggiuntiva; lo strato server è autoritativo.

(2) **Allowlist `raw_attrs`.** Per i livelli A e B, è applicata una lista
limitativa degli attributi tecnici trasmissibili; ogni tentativo di
trasmissione di un attributo fuori lista è rigettato dal server (HTTP 400).

(3) **Isolamento del tenant.** Le tabelle del piano di controllo sono protette
da Row-Level Security (RLS); la sonda di fuga inter-tenant (INT9) restituisce
zero righe in CI. Lo stoccaggio degli eventi è partizionato per
`(tenant_id, engineer_id, day)`; la cancellazione è atomica e non rigiocabile
(`DROP PARTITION`).

(4) **Pseudonimizzazione degli aggregati.** Gli aggregati conservati a tempo
indeterminato sono pseudonimizzati per derivazione propria al tenant
(`HMAC(engineer_id, tenant_salt)`), con conseguente impossibilità di join
inter-tenant. Tale pseudonimizzazione fonda la conservazione degli aggregati
ai sensi della *carve-out* art. 17(3)(e) GDPR (finalità statistiche).

(5) **Pipeline on-device (Clio-adapted).** Prima di qualsiasi invio, sulla
postazione: redazione di segreti (TruffleHog, Gitleaks) e di dati personali
(Presidio) ; astrazione esclusivamente da LLM locale (MCP verso Claude Code o
Codex locale dell'utente; in subordine, Ollama Qwen 2.5-7B locale);
verificazione dell'assenza di contenuto identificante; embedding locale
(Xenova MiniLM-L6). **Nessun LLM in cloud è invocato su contenuto grezzo.**
Il testo grezzo del prompt non lascia mai la postazione, salvo nelle ipotesi
del §10 c. 4.

(6) **Modifica del livello — firma Ed25519 e periodo di sospensione.** Ogni
modifica tenant-wide del livello predefinito è subordinata: alla firma
crittografica Ed25519 della configurazione; a un **periodo di sospensione
di sette giorni** tra la firma e l'efficacia; alla visualizzazione di un
banner in-IDE a ciascun lavoratore interessato durante il periodo;
all'**informazione preventiva scritta delle Rappresentanze Sindacali al
più tardi all'inizio del periodo di sospensione**.

(7) **Registri append-only.** I registri di audit (`audit_log`,
`audit_events`) sono memorizzati in modalità append-only a livello di base
dati (revoca dei privilegi `UPDATE`, `DELETE`).

(8) **Egress allowlist.** Il collettore supporta il flag `--ingest-only-to`
con pinning del certificato TLS; un binario compromesso o sostituito non può
quindi esfiltrare dati verso una destinazione di terzi.

(9) **Disabilitazione dei core dump.** La generazione di core dump è
disabilitata per configurazione (`ulimit -c 0`, `RLIMIT_CORE=0`). Il comando
`bematist doctor` ne verifica la conformità.

---

## §9 Conservazione dei dati — Tetto Garante 21 giorni

(1) **Default per i tenant italiani.** In considerazione del Provv. del
Garante per la protezione dei dati personali n. 364 del 5 dicembre 2024
(Programmi e servizi informatici di gestione della posta elettronica nel
contesto lavorativo) e dell'analogia che le Parti riconoscono fra metadati
di posta elettronica e metadati di utilizzo di strumenti di sviluppo (entrambi
suscettibili di consentire ricostruzioni dell'attività del lavoratore), gli
**eventi grezzi del Sistema sono conservati per un periodo predefinito non
superiore a 21 giorni di calendario** per le unità produttive coperte dal
presente accordo.

(2) **Tetto Garante 21 giorni — citazione.** Le Parti danno espressamente
atto che il Garante, con il citato Provv. 364/2024, ha individuato un termine
di conservazione **non superiore a 21 giorni** per i metadati di accesso e
utilizzo dei programmi di posta elettronica nel contesto lavorativo, salvo
specifico *accordo sindacale* o autorizzazione INL per termini superiori,
giustificati da comprovate necessità tecniche o organizzative. Le Parti
applicano per analogia tale criterio al Sistema.

(3) **Cancellazione atomica.** La cancellazione degli eventi grezzi avviene
mediante eliminazione atomica della partizione di base dati ; non è
ammesso, per i livelli A e B, il ricorso a meccanismi TTL.

(4) **Termini superiori — condizionati ad accordo specifico.** Qualunque
conservazione superiore a 21 giorni di eventi grezzi è subordinata a:

a) la stipulazione di un **avenant** specifico al presente accordo, che
   indichi la durata, la giustificazione organizzativa o tecnica, e le
   misure di compensazione (in particolare ulteriori restrizioni di
   accesso) ; ovvero, in mancanza di accordo,

b) l'**autorizzazione INL** ai sensi dell'art. 4 c. 1 SdL.

In nessun caso può procedersi a una conservazione superiore a 21 giorni
senza una delle due condizioni di cui sopra.

(5) **Aggregati pseudonimizzati.** Gli aggregati post-rollup sono conservati
a tempo indeterminato, esclusivamente in forma pseudonimizzata ai sensi del
§8 c. 4.

(6) **Registri di audit.** I registri `audit_log` e `audit_events` sono
conservati a tempo indeterminato, salvo richieste di cancellazione ai sensi
del GDPR art. 17 e in assenza di motivi imperativi di conservazione.

(7) **Richieste di cancellazione.** Le richieste di cancellazione sono evase
in sette giorni di calendario al massimo; il loro trattamento è tracciato
nel registro di audit.

---

## §10 Protezione dei dati personali (GDPR, Codice Privacy, Garante)

(1) **Principi.** Liceità, finalità determinata, minimizzazione, esattezza,
limitazione della conservazione, integrità e riservatezza (GDPR art. 5).
Basi giuridiche: GDPR art. 6(1)(b) per i trattamenti strettamente necessari
all'esecuzione del contratto di lavoro ; GDPR art. 6(1)(f) per le finalità
di pilotaggio e di affidabilità, previo *test di bilanciamento* documentato
nella DPIA. Il consenso non è retenu in ragione dell'asimmetria del rapporto
di lavoro (CEPD Op. 2/2017).

(2) **Informativa.** L'informativa ex art. 13 GDPR è redatta secondo il
modello allegato e consegnata individualmente prima dell'inizio del
trattamento (cfr. §6 c. 1) ; è altresì pubblicata sull'intranet.

(3) **Diritti dell'interessato (art. 15–22 GDPR).** Esercitabili nei termini
del §6 c. 2 ; termine di sette giorni per accesso, cancellazione e
portabilità.

(4) **Livello C — condizioni cumulative di ammissibilità.** Il trattamento
al livello C è ammesso solo in una delle tre ipotesi seguenti, ciascuna
tracciata nel registro di audit :

a) **Consenso progetto per progetto.** Il lavoratore consente espressamente,
   in modo informato e revocabile in ogni momento, all'innalzamento al
   livello C per uno specifico progetto. La revoca produce effetto
   immediato. Nessuna conseguenza professionale negativa può derivare dal
   diniego o dalla revoca (§6 c. 7).

b) **Attivazione tenant-wide a opera dell'amministrazione.** L'amministrazione
   attiva il livello C a livello di tenant, alle condizioni cumulative
   seguenti :

   - la configurazione è firmata con chiave Ed25519 ;
   - tra la firma e l'efficacia decorre un **periodo di sospensione di sette
     giorni** ;
   - prima dell'efficacia, è visualizzato un banner nell'ambiente di
     sviluppo di ciascun lavoratore interessato ;
   - **le Rappresentanze Sindacali sono informate per iscritto al più tardi
     all'inizio del periodo di sospensione** e ricevono facoltà di
     osservazioni durante tale periodo.

c) **Conservazione contenziosa ("legal hold").** Conservazione nominata,
   temporalmente delimitata e motivata da ragioni giuridiche, attivata
   esclusivamente da un account di ruolo "Auditor". La misura è
   documentata e motivata, ed è notificata alle Rappresentanze Sindacali
   nel rispetto degli eventuali obblighi di riservatezza.

(5) **DPIA.** È condotta una *Valutazione d'impatto sulla protezione dei
dati* (GDPR art. 35) prima dell'avvio. Il DPO ({{DPO_EMAIL}}) e, in via
consultiva, le Rappresentanze Sindacali sono associati. Modello in allegato
(`legal/review/DPIA.md`).

(6) **Sotto-responsabili (art. 28 GDPR).** Ogni sotto-responsabile è
designato con contratto scritto. La lista in vigore è in allegato.

(7) **Trasferimenti extra UE.** Eventuali trasferimenti verso paesi terzi
(in particolare nell'opzione "cloud gestito" con sotto-responsabili
statunitensi) sono regolati dalle Clausole Contrattuali Tipo 2021/914
Modulo 2 e, ove applicabile, dall'auto-certificazione DPF. Una *Transfer
Impact Assessment* (TIA) è versata al fascicolo (`legal/review/SCCs-module-2.md`).

---

## §11 Diritti delle Rappresentanze Sindacali — Osservatorio paritetico

(1) **Costituzione dell'osservatorio paritetico.** Sul modello dell'accordo
GSK–ViiV Healthcare con RSU del 28 luglio 2025, le Parti istituiscono un
**osservatorio paritetico** sul Sistema, composto pariteticamente da
rappresentanti del Datore di lavoro (ivi compreso il DPO) e delle
Rappresentanze Sindacali. L'osservatorio si riunisce a cadenza trimestrale,
con possibilità di convocazione straordinaria.

(2) **Mandato dell'osservatorio.** L'osservatorio:

a) sorveglia il rispetto delle finalità (§4) ;
b) sorveglia il rispetto dei divieti (§5) ;
c) verifica il rispetto delle soglie di k-anonimato e dei *gates* di
   esposizione individuale (§5 c. 4 e c. 5) ;
d) esamina le statistiche di redazione lato server (numero di segreti
   rilevati, casistica) ;
e) riceve il rapporto annuale sulle eccezioni del §10 c. 4 attivate ;
f) propone modifiche al presente accordo ;
g) riceve il **questionario anonimo annuale** somministrato al personale
   coperto.

(3) **Informazione preventiva alle modifiche.** Ogni modifica del
parametraggio che incide sul livello, sulle regole di redazione, sulle
durate di conservazione o sull'interfaccia di gestione è oggetto di
informazione preventiva scritta alle Rappresentanze Sindacali. Il periodo
di sospensione di cui al §10 c. 4 lit. b si applica.

(4) **Diritto a perizia tecnica.** Le Rappresentanze Sindacali possono
ricorrere a un perito di fiducia (a spese del Datore di lavoro nei limiti
della contrattazione collettiva applicabile) per la verifica delle misure
tecniche del §8, in particolare delle regole `packages/redact` e dei
binari firmati Sigstore / SLSA.

(5) **Accesso aggregato al registro.** Le Rappresentanze Sindacali ricevono,
su richiesta, restituzioni aggregate e anonime del registro `audit_events`,
indicative della numerosità delle consultazioni gerarchiche nominative.
Non hanno accesso a dati di evento individuali.

(6) **Questionario anonimo.** A cadenza annuale, è somministrato al personale
coperto un questionario anonimo sull'impatto percepito del Sistema; la
sintesi è presentata all'osservatorio.

(7) **Compiti delle RSA aderenti a OO.SS. firmatarie del CCNL.** Le
prerogative del presente accordo non pregiudicano le prerogative di legge e
di contratto collettivo delle OO.SS.

---

## §12 Formazione

(1) Prima dell'avvio in produzione, ciascun lavoratore o lavoratrice
interessato riceve una formazione documentata su:

a) funzionamento e finalità del Sistema ;
b) livelli di raccolta e differenze (§3 c. 1–3) ;
c) diritti del lavoratore (§6) e modalità di esercizio, incluso l'uso dei
   comandi `bematist audit --tail`, `bematist erase`, `bematist export` ;
d) opposizione al livello C progetto per progetto.

(2) I *manager* destinatari di accessi alla console di gestione ricevono una
formazione approfondita sulle finalità autorizzate (§4), sui divieti (§5),
sull'obbligo di tracciamento di ogni consultazione e sulla matrice di
accesso del §5 c. 3.

(3) La formazione si svolge in orario di lavoro ed è retribuita.

(4) Il DPO e le Rappresentanze Sindacali sono associati alla redazione e
all'aggiornamento dei materiali formativi.

---

## §13 Composizione delle controversie

(1) Le controversie sull'interpretazione o sull'applicazione del presente
accordo sono sottoposte in prima battuta all'osservatorio paritetico
(§11), che si pronuncia entro trenta giorni.

(2) In mancanza di soluzione, è esperito il tentativo di conciliazione ai
sensi degli artt. 410 e 411 c.p.c. presso la Direzione Territoriale del
Lavoro competente.

(3) Restano salvi i ricorsi al Tribunale del Lavoro, alle autorità di
controllo (Garante; INL), nonché — quando applicabile — la disciplina di
cui all'art. 28 SdL (condotta antisindacale).

(4) Il contatto fornitore per le escalation tecniche è
{{CONTATTO_ESCALATION}}. Tale contatto non genera alcun rapporto
contrattuale diretto tra le Rappresentanze Sindacali e il fornitore.

---

## §14 Durata, recesso, modifiche

(1) Il presente accordo entra in vigore il {{DATA_EFFETTO}} e ha durata di
**24 mesi**, automaticamente rinnovabili per ulteriori 12 mesi salvo
disdetta di una delle Parti con preavviso di **tre mesi**.

(2) **Disdetta in caso di mutamento sostanziale.** Il sopraggiungere di una
modifica sostanziale del Sistema (in particolare, ma non solo, modifica del
livello predefinito, modifica del provider di embedding, introduzione di
nuovi adattatori), del quadro normativo (in particolare, futuri
provvedimenti del Garante o del legislatore), o della struttura aziendale
(in particolare, fusioni o trasferimenti di ramo) può legittimare la
disdetta anticipata.

(3) **Cessazione del Sistema.** In caso di cessazione dell'utilizzo del
Sistema, i dati grezzi sono cancellati entro **trenta giorni di calendario**
dalla cessazione; gli aggregati di cui al §8 c. 4 restano conservati in
forma pseudonimizzata, salvo richiesta di cancellazione ex GDPR art. 17.

(4) **Modifiche.** Ogni modifica al presente accordo richiede la forma
scritta e la firma delle stesse Parti.

(5) **Salvezza delle clausole.** L'invalidità di una singola clausola non
travolge le altre; le Parti si impegnano a sostituire la clausola invalida
con una clausola che ne riproduca, per quanto possibile, l'effetto utile.

---

## §15 Allegati

- **Allegato 1 :** Schema di flusso tecnico del Sistema.
- **Allegato 2 :** Modello di DPIA (`legal/review/DPIA.md`).
- **Allegato 3 :** Lista dei sotto-responsabili e flussi extra UE
  (`legal/review/SCCs-module-2.md`).
- **Allegato 4 :** Modello di informativa individuale (art. 13 GDPR + art. 4
  c. 3 SdL).
- **Allegato 5 :** Bill of Rights e rider contrattuale
  (`legal/review/bill-of-rights-rider.md`).
- **Allegato 6 :** Specifica tecnica del registro `audit_events` e delle
  regole `packages/redact`.

---

## §16 Sottoscrizioni

Luogo e data: ____________________________________

**Per il Datore di lavoro :**

{{DATORE_DI_LAVORO}}

________________________________________________
(Firma, nome in stampatello, qualifica)

**Per le Rappresentanze Sindacali :**

{{RSU_O_RSA}}

________________________________________________
(Firma e nome in stampatello)

---

<!--
================================================================================
 ENGLISH FOOTER — for Workstream I owner (Sandesh) + IT-qualified counsel
================================================================================

**IT-counsel review checklist (mandatory before execution with any customer).**

1. Verify the Art. 4 c. 1 SdL framing in §1 c. 3 against current Cassazione
   case law on "controllo a distanza" objective-suitability test (intent-
   irrelevant). Confirm Cass. 28365/2025 is final and correctly cited; if a
   later decision has refined or overruled the comma 2 narrowing, update §1
   c. 4.
2. Validate §1 c. 4 — the *strumento-di-lavoro* comma 2 trap exclusion. The
   verbatim formulation must reflect Cass. 28365/2025; counsel may propose
   stronger ("escludono qualsiasi qualificazione") or softer ("escludono di
   norma") wording.
3. Confirm Garante Provv. 364/2024 21-day ceiling (§9 c. 1–c. 2) is correctly
   cited and the analogy from email metadata to dev-tool metadata is
   defensible. The Provv. addresses email; the analogy is principled (both
   metadata categories are suitable to reconstruct the worker's activity)
   but counsel must validate it before customer use.
4. Validate §9 c. 4 (>21d retention requires avenant or INL authorization).
   Counsel may propose pre-clearing common scenarios (e.g., 30-day for
   incident investigation) via a checklist annex.
5. Confirm §10 c. 4 lit. b (Ed25519 + 7-day cooldown + IC banner + RSU
   "informazione preventiva") provides meaningful participation. Note that
   "informazione preventiva" alone may be insufficient under Italian
   doctrine, which often requires *consultazione* (joint examination) for
   substantive changes; counsel may propose strengthening to consultazione.
6. Validate §11 c. 1 (osservatorio paritetico modello GSK–ViiV) against
   current Italian practice. The 28 luglio 2025 accordo is cited but its
   full text is not public (compliance PRD §11.1 E-4). Counsel may need to
   substitute / supplement with publicly available accordi.
7. Confirm §13 c. 2 (conciliazione 410/411 c.p.c.) — Italian labour
   procedure has been reformed several times; verify the current procedural
   provisions on tentativo di conciliazione before INL/DTL.
8. Confirm §13 c. 3 (Art. 28 SdL condotta antisindacale) is correctly
   reserved.
9. Confirm §14 c. 1 (24-month duration + tacit renewal + 3-month notice) is
   compatible with the customer's CCNL.
10. Confirm all placeholders (`{{DATORE_DI_LAVORO}}`, `{{RSU_O_RSA}}`, etc.)
    are replaced before execution and that the proper signatories are RSU
    members or RSA chairs of unions firmatarie of the applicable CCNL.

**Counsel-priority sections (phrasing authored by non-IT-qualified drafter).**

- §1 c. 4 — Cass. 28365/2025 strumento-di-lavoro narrowing: the load-bearing
  citation per CR-9. Counsel to verify exact holding and to confirm the
  exclusion language captures the ratio without overreaching.
- §1 c. 5 — "idoneo al monitoraggio" objective test: confirm the formulation
  aligns with current Cass. and with EDPB Op. 2/2017.
- §4 c. 1 — exclusive list of finalità organizzative o produttive: counsel
  may propose adding "esigenze di sicurezza del lavoro" or "tutela del
  patrimonio aziendale" if relevant; current draft excludes them as not
  applicable to Bema.
- §5 c. 1 — divieto di controllo della prestazione e del comportamento:
  drafted as parallel to DE verbatim clause; confirm enforceability under
  art. 4 c. 1 SdL + GDPR art. 5(1)(b) purpose limitation in IT context.
- §6 c. 7 — "nessuna conseguenza professionale negativa" (anti-retaliation):
  confirm consistency with art. 15 SdL and CCNL anti-discrimination clauses.
- §7 — tutele art. 8 e art. 15 SdL: confirm the four sub-clauses (opinions,
  discrimination, sindacale, whistleblowing D.Lgs. 24/2023) are exhaustive
  and correctly framed.
- §9 c. 1 — 21-day default for IT tenants: this is a customer-facing
  contractual default that DIVERGES from Bema global defaults
  (90/90/30). Per CR-9, the product-side resolution (CW-5) is pending. The
  template binds the customer contractually pending product-side decision.
  Counsel and product to align before promotion to legal/templates/.
- §10 c. 4 lit. b — informazione preventiva vs. consultazione: see checklist
  item 5.
- §11 c. 1 — osservatorio paritetico modello GSK–ViiV: structural template
  per CR-9. Counsel to confirm the bipartite model is enforceable absent a
  CCNL-level reference.
- §14 c. 3 — 30-day post-cessation deletion: confirm consistency with art.
  17 GDPR and with any sectoral retention obligations (D.Lgs. 81/2015 for
  payroll-adjacent records, etc.).

**Verbatim-citation audit (per compliance PRD §11.1 CR-9 + §5 IT row).**

The three load-bearing IT anchors required by the brief are cited as follows:

- **GSK–ViiV Healthcare + RSU accordo (28 luglio 2025)** — cited in §3 c. 11
  (definizione osservatorio paritetico), §11 c. 1 (costituzione
  osservatorio modello GSK–ViiV). Cited 2× in this file. NB: full accordo
  text is not public; cited per Lavorosi / Il Sole 24 Ore secondary
  reporting (compliance PRD §11.1 E-4).
- **Garante Provv. 364/2024 (5 dicembre 2024)** — 21-day metadata retention
  ceiling. Cited in preamble (load-bearing trigger), §9 c. 1 (default),
  §9 c. 2 (verbatim citation of the 21-day ceiling), §9 c. 4 (>21d
  conditions). Cited 4× in this file.
- **Cass. sez. lav. n. 28365/2025** — strumento-di-lavoro c. 2 trap
  narrowing. Cited in preamble (load-bearing trigger), §1 c. 4 (verbatim
  exclusion of c. 2 qualification). Cited 2× in this file.

**Changelog.**

- 2026-04-17 — Initial template draft (Workstream I A13, Sprint 1 Week 2).
  Covers art. 4 c. 1 SdL + art. 4 c. 2 SdL exception + art. 4 c. 3 SdL
  utilization + art. 8 + art. 15 + art. 28 + GDPR art. 88 + Garante Provv.
  364/2024 + Cass. 28365/2025. Default IT retention set to 21 days
  contractually pending CW-5 product decision. Awaiting IT-counsel review.

**Cross-references.**

- `dev-docs/workstreams/i-compliance-prd.md` §5 IT row + §11.1 OQ-2 + CR-9.
- `legal/review/works-agreement-DE.md` — parallel instrument for DE workforce
  (non-substituting).
- `legal/review/cse-consultation-FR.md` — parallel instrument for FR
  workforce.
- `legal/review/DPIA.md` — DPIA allegata.
- `legal/review/SCCs-module-2.md` — trasferimenti extra UE.
- `legal/review/bill-of-rights-rider.md` — rider contrattuale.
- `CLAUDE.md` §Compliance Rules, §Privacy Model Rules, §Security Rules.

================================================================================
-->
