// Odświeża data.json dla aplikacji Giełda od Zera.
// Uruchom: node tools/update-data.mjs                 (wszystko)
//          node tools/update-data.mjs --only PKO.WA,BTC-USD   (dociągnij wybrane i dopisz do istniejącego pliku)
// Źródło: darmowe, nieoficjalne API wykresów Yahoo Finance (dane opóźnione).
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const oi = args.indexOf("--only");
const ONLY = oi >= 0 ? new Set(args[oi + 1].split(",")) : null;
const OUT = args.find((a, i) => !a.startsWith("--") && i !== oi + 1) || join(dirname(fileURLToPath(import.meta.url)), "..", "data.json");
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

// [symbol Yahoo, id w aplikacji, nazwa, klasa, branża/opis krótki, opis, dodatkowe pola]
const U = [
  // Akcje GPW
  ["PKO.WA", "PKO", "PKO BP", "akcje-pl", "Banki", "Największy bank w Polsce: kredyty, konta, leasing.", { sx: "PL-BANKI" }],
  ["PEO.WA", "PEO", "Bank Pekao", "akcje-pl", "Banki", "Drugi co do wielkości bank w Polsce.", { sx: "PL-BANKI" }],
  ["MBK.WA", "MBK", "mBank", "akcje-pl", "Banki", "Bank internetowy, klienci indywidualni i firmy.", { sx: "PL-BANKI" }],
  ["PZU.WA", "PZU", "PZU", "akcje-pl", "Ubezpieczenia", "Największy ubezpieczyciel w Europie Środkowo-Wschodniej.", { sx: "PL-FINANSE" }],
  ["PKN.WA", "PKN", "Orlen", "akcje-pl", "Paliwa i energia", "Rafinerie, stacje paliw, gaz i energetyka.", { sx: "PL-ENERGIA" }],
  ["PGE.WA", "PGE", "PGE", "akcje-pl", "Energetyka", "Największy wytwórca prądu w Polsce.", { sx: "PL-ENERGIA" }],
  ["KGH.WA", "KGH", "KGHM", "akcje-pl", "Surowce", "Wydobycie miedzi i srebra. Cena zależy od cen metali.", { sx: "PL-SUROWCE" }],
  ["CDR.WA", "CDR", "CD Projekt", "akcje-pl", "Gry", "Twórca gier wideo. Kurs mocno reaguje na premiery.", { sx: "PL-GRY" }],
  ["LPP.WA", "LPP", "LPP", "akcje-pl", "Handel / odzież", "Marki odzieżowe Reserved, Sinsay, Cropp, House, Mohito.", { sx: "PL-HANDEL" }],
  ["DNP.WA", "DNP", "Dino Polska", "akcje-pl", "Handel / spożywczy", "Sieć supermarketów w mniejszych miejscowościach.", { sx: "PL-HANDEL" }],
  ["ALE.WA", "ALE", "Allegro", "akcje-pl", "E-commerce", "Największa platforma zakupów internetowych w Polsce.", { sx: "PL-HANDEL" }],
  ["XTB.WA", "XTB", "XTB", "akcje-pl", "Finanse / broker", "Dom maklerski online, zarabia na aktywności klientów.", { sx: "PL-FINANSE" }],
  ["KRU.WA", "KRU", "Kruk", "akcje-pl", "Finanse / windykacja", "Kupuje i odzyskuje portfele zaległych długów.", { sx: "PL-FINANSE" }],
  ["BDX.WA", "BDX", "Budimex", "akcje-pl", "Budownictwo", "Największa firma budowlana w Polsce.", { sx: "PL-BUDOWA" }],
  ["ALR.WA", "ALR", "Alior Bank", "akcje-pl", "Banki", "Bank detaliczny, dużo kredytów konsumpcyjnych.", { sx: "PL-BANKI" }],
  ["BHW.WA", "BHW", "Bank Handlowy", "akcje-pl", "Banki", "Bank Citi w Polsce, głównie klienci korporacyjni.", { sx: "PL-BANKI" }],
  ["MIL.WA", "MIL", "Bank Millennium", "akcje-pl", "Banki", "Bank detaliczny z dużym portfelem kredytów frankowych w przeszłości.", { sx: "PL-BANKI" }],
  ["TPE.WA", "TPE", "Tauron", "akcje-pl", "Energetyka", "Dystrybucja i wytwarzanie prądu na południu Polski.", { sx: "PL-ENERGIA" }],
  ["ENA.WA", "ENA", "Enea", "akcje-pl", "Energetyka", "Grupa energetyczna z zachodniej Polski.", { sx: "PL-ENERGIA" }],
  ["JSW.WA", "JSW", "JSW", "akcje-pl", "Górnictwo", "Wydobycie węgla koksowego. Bardzo zmienna.", { sx: "PL-SUROWCE" }],
  ["ATT.WA", "ATT", "Grupa Azoty", "akcje-pl", "Chemia", "Nawozy i chemia. Zależy od cen gazu.", { sx: "PL-SUROWCE" }],
  ["TEN.WA", "TEN", "Ten Square Games", "akcje-pl", "Gry", "Gry mobilne, m.in. o wędkarstwie.", { sx: "PL-GRY" }],
  ["PLW.WA", "PLW", "PlayWay", "akcje-pl", "Gry", "Wydawca wielu małych gier na PC i konsole.", { sx: "PL-GRY" }],
  ["PCO.WA", "PCO", "Pepco", "akcje-pl", "Handel / dyskont", "Sklepy z tanią odzieżą i artykułami domowymi.", { sx: "PL-HANDEL" }],
  ["DOM.WA", "DOM", "Dom Development", "akcje-pl", "Deweloper", "Jeden z największych deweloperów mieszkaniowych.", { sx: "PL-BUDOWA" }],
  ["1AT.WA", "1AT", "Atal", "akcje-pl", "Deweloper", "Deweloper mieszkaniowy.", { sx: "PL-BUDOWA" }],
  ["CPS.WA", "CPS", "Cyfrowy Polsat", "akcje-pl", "Media / telekom", "Telewizja Polsat i sieć Plus.", { sx: "PL-TELEKOM" }],
  ["OPL.WA", "OPL", "Orange Polska", "akcje-pl", "Telekomunikacja", "Telefonia, internet i światłowody.", { sx: "PL-TELEKOM" }],
  ["ACP.WA", "ACP", "Asseco Poland", "akcje-pl", "Informatyka", "Największa polska firma informatyczna.", { sx: "PL-TELEKOM" }],
  ["KTY.WA", "KTY", "Kęty", "akcje-pl", "Przemysł", "Profile aluminiowe, systemy budowlane i opakowania.", { sx: "PL-PRZEMYSL" }],
  ["CAR.WA", "CAR", "Inter Cars", "akcje-pl", "Dystrybucja", "Największy dystrybutor części samochodowych.", { sx: "PL-PRZEMYSL" }],
  // Akcje USA
  ["AAPL", "AAPL", "Apple", "akcje-us", "Technologia", "iPhone, Mac, usługi i App Store.", { sx: "XLK" }],
  ["MSFT", "MSFT", "Microsoft", "akcje-us", "Technologia", "Windows, Office, chmura Azure.", { sx: "XLK" }],
  ["NVDA", "NVDA", "NVIDIA", "akcje-us", "Półprzewodniki", "Procesory graficzne i układy do AI.", { sx: "SMH" }],
  ["AMD", "AMD", "AMD", "akcje-us", "Półprzewodniki", "Procesory i karty graficzne.", { sx: "SMH" }],
  ["AMZN", "AMZN", "Amazon", "akcje-us", "E-commerce / chmura", "Sklep internetowy i chmura AWS.", { sx: "XLY" }],
  ["GOOGL", "GOOGL", "Alphabet (Google)", "akcje-us", "Komunikacja", "Wyszukiwarka, YouTube, reklamy, chmura.", { sx: "XLC" }],
  ["META", "META", "Meta", "akcje-us", "Komunikacja", "Facebook, Instagram, WhatsApp.", { sx: "XLC" }],
  ["TSLA", "TSLA", "Tesla", "akcje-us", "Motoryzacja", "Samochody elektryczne i magazyny energii. Bardzo zmienny kurs.", { sx: "XLY" }],
  ["JPM", "JPM", "JPMorgan Chase", "akcje-us", "Banki", "Największy bank w USA.", { sx: "XLF" }],
  ["KO", "KO", "Coca-Cola", "akcje-us", "Dobra podstawowe", "Napoje. Spokojna spółka dywidendowa.", { sx: "XLP" }],
  ["JNJ", "JNJ", "Johnson & Johnson", "akcje-us", "Ochrona zdrowia", "Leki i sprzęt medyczny.", { sx: "XLV" }],
  ["XOM", "XOM", "ExxonMobil", "akcje-us", "Energia", "Ropa i gaz.", { sx: "XLE" }],
  // Indeksy i rynki świata
  ["ETFBM40TR.WA", "ETFBM40TR", "ETF mWIG40TR", "indeksy", "ETF na indeks GPW", "Fundusz ETF naśladujący 40 średnich spółek z GPW z dywidendami.", {}],
  ["ETFBS80TR.WA", "ETFBS80TR", "ETF sWIG80TR", "indeksy", "ETF na indeks GPW", "Fundusz ETF naśladujący 80 mniejszych spółek z GPW z dywidendami.", {}],
  ["ETFBW20TR.WA", "ETFBW20TR", "ETF WIG20TR", "indeksy", "ETF na indeks GPW", "Fundusz ETF naśladujący WIG20 z dywidendami. Można go kupić jak akcję.", {}],
  ["EPOL", "EPOL", "Polska w dolarach (ETF)", "indeksy", "ETF kraj", "Polskie akcje notowane w USA, w dolarach. Pokazuje, jak zagraniczny kapitał patrzy na Polskę.", {}],
  ["SPY", "SPY", "ETF S&P 500", "indeksy", "ETF na indeks USA", "500 największych spółek w USA.", {}],
  ["QQQ", "QQQ", "ETF Nasdaq-100", "indeksy", "ETF na indeks USA", "100 największych spółek z Nasdaq, głównie technologia.", {}],
  ["DIA", "DIA", "ETF Dow Jones", "indeksy", "ETF na indeks USA", "30 dużych, dojrzałych spółek z USA.", {}],
  ["IWM", "IWM", "ETF Russell 2000", "indeksy", "ETF na indeks USA", "2000 małych spółek z USA. Wrażliwe na koniunkturę i stopy procentowe.", {}],
  ["RSP", "RSP", "ETF S&P 500 równoważony", "indeksy", "ETF na indeks USA", "500 spółek, każda z tą samą wagą. Pokazuje, czy rośnie cały rynek, czy tylko giganci.", {}],
  ["ACWI", "ACWI", "ETF akcje świata", "indeksy", "ETF świat", "Około 2500 spółek z rynków rozwiniętych i wschodzących.", {}],
  ["EFA", "EFA", "ETF rynki rozwinięte bez USA", "indeksy", "ETF świat", "Europa, Japonia, Australia i inne rozwinięte rynki poza USA.", {}],
  ["EEM", "EEM", "ETF rynki wschodzące", "indeksy", "ETF świat", "Chiny, Tajwan, Indie, Korea, Brazylia i inne.", {}],
  ["VGK", "VGK", "ETF Europa", "indeksy", "ETF region", "Duże i średnie spółki z Europy.", {}],
  ["EWG", "EWG", "ETF Niemcy", "indeksy", "ETF kraj", "Duże spółki niemieckie.", {}],
  ["EWJ", "EWJ", "ETF Japonia", "indeksy", "ETF kraj", "Duże i średnie spółki japońskie.", {}],
  ["MCHI", "MCHI", "ETF Chiny", "indeksy", "ETF kraj", "Duże i średnie spółki chińskie.", {}],
  ["INDA", "INDA", "ETF Indie", "indeksy", "ETF kraj", "Duże i średnie spółki indyjskie.", {}],
  ["EWZ", "EWZ", "ETF Brazylia", "indeksy", "ETF kraj", "Duże spółki brazylijskie, dużo surowców i banków.", {}],
  // Sektory USA (ETF SPDR)
  ["XLK", "XLK", "Technologia", "sektory-us", "Sektor USA", "Oprogramowanie, sprzęt, półprzewodniki.", {}],
  ["XLC", "XLC", "Komunikacja", "sektory-us", "Sektor USA", "Internet, media, telekomunikacja.", {}],
  ["XLY", "XLY", "Dobra cykliczne", "sektory-us", "Sektor USA", "Handel, samochody, hotele: wydatki, z których ludzie rezygnują w kryzysie.", {}],
  ["XLF", "XLF", "Finanse", "sektory-us", "Sektor USA", "Banki, ubezpieczyciele, giełdy.", {}],
  ["XLI", "XLI", "Przemysł", "sektory-us", "Sektor USA", "Maszyny, transport, lotnictwo, zbrojeniówka.", {}],
  ["XLB", "XLB", "Materiały", "sektory-us", "Sektor USA", "Chemia, metale, opakowania.", {}],
  ["XLE", "XLE", "Energia", "sektory-us", "Sektor USA", "Ropa i gaz.", {}],
  ["XLV", "XLV", "Ochrona zdrowia", "sektory-us", "Sektor USA", "Leki, szpitale, sprzęt medyczny. Sektor defensywny.", {}],
  ["XLP", "XLP", "Dobra podstawowe", "sektory-us", "Sektor USA", "Żywność, napoje, chemia domowa. Sektor defensywny.", {}],
  ["XLU", "XLU", "Użyteczność publiczna", "sektory-us", "Sektor USA", "Prąd, gaz, woda. Defensywny, wrażliwy na stopy procentowe.", {}],
  ["XLRE", "XLRE", "Nieruchomości", "sektory-us", "Sektor USA", "Fundusze nieruchomości (REIT). Wrażliwe na stopy procentowe.", {}],
  // Branże i tematy USA
  ["SMH", "SMH", "Półprzewodniki", "branze-us", "Branża USA", "Producenci chipów: NVIDIA, TSMC, Broadcom i inni.", {}],
  ["IGV", "IGV", "Oprogramowanie", "branze-us", "Branża USA", "Firmy programistyczne i chmurowe.", {}],
  ["XBI", "XBI", "Biotechnologia", "branze-us", "Branża USA", "Małe i średnie firmy biotechnologiczne. Bardzo zmienne.", {}],
  ["KRE", "KRE", "Banki regionalne", "branze-us", "Branża USA", "Mniejsze banki z USA, wrażliwe na kredyt i nieruchomości.", {}],
  ["ITA", "ITA", "Lotnictwo i zbrojeniówka", "branze-us", "Branża USA", "Producenci samolotów i uzbrojenia.", {}],
  ["ITB", "ITB", "Budowa domów", "branze-us", "Branża USA", "Deweloperzy i dostawcy materiałów. Wrażliwe na oprocentowanie kredytów.", {}],
  ["XRT", "XRT", "Handel detaliczny", "branze-us", "Branża USA", "Sklepy i sieci handlowe, każda z podobną wagą.", {}],
  ["ICLN", "ICLN", "Czysta energia", "branze-us", "Branża USA", "Energia słoneczna, wiatrowa i inne odnawialne.", {}],
  // Surowce (ETF)
  ["GLD", "GLD", "Złoto", "surowce", "Metal szlachetny", "ETF trzymający fizyczne złoto. Tradycyjnie bezpieczna przystań.", {}],
  ["SLV", "SLV", "Srebro", "surowce", "Metal szlachetny", "ETF trzymający fizyczne srebro. Bardziej zmienne niż złoto.", {}],
  ["PPLT", "PPLT", "Platyna", "surowce", "Metal szlachetny", "ETF trzymający fizyczną platynę.", {}],
  ["CPER", "CPER", "Miedź", "surowce", "Metal przemysłowy", "Kontrakty na miedź. Miedź reaguje na koniunkturę w przemyśle.", {}],
  ["USO", "USO", "Ropa naftowa", "surowce", "Energia", "Kontrakty na ropę WTI.", {}],
  ["UNG", "UNG", "Gaz ziemny", "surowce", "Energia", "Kontrakty na gaz ziemny z USA. Bardzo zmienny.", {}],
  ["URA", "URA", "Uran", "surowce", "Energia", "Spółki wydobywające uran i firmy jądrowe.", {}],
  ["DBA", "DBA", "Rolnictwo", "surowce", "Rolnictwo", "Kontrakty na kukurydzę, soję, pszenicę, cukier, kawę i kakao.", {}],
  ["GDX", "GDX", "Kopalnie złota", "surowce", "Akcje surowcowe", "Spółki wydobywające złoto. Ruszają się mocniej niż samo złoto.", {}],
  ["DBC", "DBC", "Koszyk surowców", "surowce", "Szeroki koszyk", "Kontrakty na energię, metale i rolnictwo w jednym funduszu.", {}],
  // Obligacje (ETF)
  ["SHY", "SHY", "Obligacje USA 1–3 lata", "obligacje", "Skarbowe krótkie", "Krótkie obligacje rządu USA. Prawie jak gotówka w dolarach.", {}],
  ["IEF", "IEF", "Obligacje USA 7–10 lat", "obligacje", "Skarbowe średnie", "Średnie obligacje rządu USA.", {}],
  ["TLT", "TLT", "Obligacje USA 20+ lat", "obligacje", "Skarbowe długie", "Długie obligacje rządu USA. Mocno tracą, gdy rosną stopy procentowe.", {}],
  ["TIP", "TIP", "Obligacje USA indeksowane inflacją", "obligacje", "Skarbowe inflacyjne", "Odsetki rosną razem z inflacją.", {}],
  ["LQD", "LQD", "Obligacje firm (inwestycyjne)", "obligacje", "Korporacyjne", "Obligacje dużych firm z dobrym ratingiem.", {}],
  ["HYG", "HYG", "Obligacje wysokodochodowe", "obligacje", "Korporacyjne ryzykowne", "Obligacje firm z niskim ratingiem. Zachowują się trochę jak akcje.", {}],
  ["EMB", "EMB", "Obligacje rynków wschodzących", "obligacje", "Rządowe EM", "Obligacje rządów krajów rozwijających się, w dolarach.", {}],
  ["BND", "BND", "Cały rynek obligacji USA", "obligacje", "Szeroki koszyk", "Obligacje skarbowe i firmowe z USA w jednym funduszu.", {}],
  ["ETFBTBSP.WA", "ETFBTBSP", "Polskie obligacje skarbowe (ETF)", "obligacje", "Skarbowe PL", "ETF na indeks polskich obligacji skarbowych TBSP.", {}],
  // Kryptowaluty
  ["BTC-USD", "BTC", "Bitcoin", "krypto", "Kryptowaluta", "Największa kryptowaluta. Notowana 7 dni w tygodniu, bardzo zmienna.", {}],
  ["ETH-USD", "ETH", "Ethereum", "krypto", "Kryptowaluta", "Druga największa kryptowaluta, platforma dla aplikacji.", {}],
  ["SOL-USD", "SOL", "Solana", "krypto", "Kryptowaluta", "Szybka sieć dla aplikacji. Bardzo zmienna.", {}],
  ["XRP-USD", "XRP", "XRP", "krypto", "Kryptowaluta", "Sieć płatności międzynarodowych.", {}],
  ["BNB-USD", "BNB", "BNB", "krypto", "Kryptowaluta", "Token giełdy Binance.", {}],
  ["IBIT", "IBIT", "ETF na bitcoina", "krypto", "ETF krypto", "Fundusz iShares trzymający bitcoiny, notowany w USA od stycznia 2024.", {}],
  // Waluty (ETF)
  ["UUP", "UUP", "Dolar amerykański", "waluty", "Waluta", "ETF rosnący, gdy dolar umacnia się wobec koszyka walut.", {}],
  ["FXE", "FXE", "Euro", "waluty", "Waluta", "ETF podążający za kursem euro do dolara.", {}],
  ["FXY", "FXY", "Jen japoński", "waluty", "Waluta", "ETF podążający za kursem jena do dolara.", {}],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (p) => (p >= 10 ? 2 : p >= 1 ? 3 : 4);
const rnd = (x, d) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

async function chart(sym, weekly) {
  const span = weekly ? `period1=0&period2=${Math.floor(Date.now() / 1000) + 86400}&interval=1wk` : "range=5y&interval=1d";
  for (const host of ["query2", "query1", "query2"]) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${span}`;
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.json();
      if (res.status === 429) await sleep(5000);
    } catch { /* ponów */ }
    await sleep(1200);
  }
  throw new Error("nie udało się pobrać " + sym);
}

const out = { as_of: null, built: new Date().toISOString(), source: "Yahoo Finance chart API (darmowe, nieoficjalne, opóźnione)", stocks: [], fx: [] };
let failed = [];
for (const [y, id, n, cls, sec, about, extra] of U.filter((u) => !ONLY || ONLY.has(u[0]))) {
  try {
    const j = await chart(y);
    const r = j.chart.result[0], q = r.indicators.quote[0], ts = r.timestamp || [];
    const rows = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if ([o, h, l, c].some((x) => x == null) || c <= 0) continue;
      const d = new Date((ts[i] + (r.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
      if (rows.length && rows[rows.length - 1][0] === d) rows.pop();
      const k = dec(c);
      rows.push([d, rnd(o, k), rnd(h, k), rnd(l, k), rnd(c, k), q.volume[i] || 0]);
    }
    if (rows.length < 260) throw new Error("za mało danych: " + rows.length);
    const st = { s: id, y, n, cls, sec, about, m: r.meta.currency === "PLN" ? "PL" : cls === "krypto" && y.endsWith("-USD") ? "CR" : "US", cur: r.meta.currency, ...extra, bars: rows };
    if (cls === "krypto" && y.endsWith("-USD")) { st.vu = 1; st.tick = 0.0001; st.frac = 1; }
    // Cała historia tygodniowa: szczyt wszech czasów (ATH) i cykle hossa/bessa
    try {
      await sleep(250);
      const wj = await chart(y, true), wr = wj.chart.result[0], wq = wr.indicators.quote[0], wt = wr.timestamp || [];
      const wd = [], wc = [];
      let athP = -Infinity, athD = null;
      for (let i = 0; i < wt.length; i++) {
        const c = wq.close[i], h = wq.high[i];
        if (c == null || c <= 0) continue;
        const day = Math.floor((wt[i] + (wr.meta.gmtoffset || 0)) / 86400);
        const dow = (day + 4) % 7; // 0 = niedziela: przesuń na poniedziałek, początek tygodnia notowań
        const dayFix = dow === 0 ? day + 1 : dow === 6 ? day + 2 : day;
        if (wd.length && wd[wd.length - 1] === dayFix) { wd.pop(); wc.pop(); }
        wd.push(dayFix); wc.push(rnd(c, dec(c)));
        if (h != null && h > athP && h < c * 3) { athP = h; athD = new Date(dayFix * 864e5).toISOString().slice(0, 10); }
      }
      // dokładny dzień ATH, jeśli wypada w danych dziennych
      let dMax = -Infinity, dDay = null;
      for (const r of rows) if (r[2] > dMax) { dMax = r[2]; dDay = r[0]; }
      let exact = 0;
      if (dMax >= athP * 0.999) { athP = dMax; athD = dDay; exact = 1; }
      if (wd.length > 10) { st.wd = wd; st.wc = wc; st.h0 = new Date(wd[0] * 864e5).toISOString().slice(0, 10); st.ath = { p: rnd(athP, dec(athP)), d: athD, ex: exact }; }
    } catch (e) { console.log("  bez historii tygodniowej", y, e.message); }
    out.stocks.push(st);
    const last = rows[rows.length - 1][0];
    if (cls !== "krypto" && (!out.as_of || last > out.as_of)) out.as_of = last;
    console.log(y.padEnd(14), String(rows.length).padStart(5), last, rows[rows.length - 1][4]);
  } catch (e) { failed.push(y); console.log("BŁĄD", y, e.message); }
  await sleep(300);
}

// Kurs USD/PLN
if (!ONLY) try {
  const j = await chart("USDPLN=X"); const r = j.chart.result[0];
  r.timestamp.forEach((t, i) => { const c = r.indicators.quote[0].close[i]; if (c != null) out.fx.push([new Date(t * 1000).toISOString().slice(0, 10), rnd(c, 4)]); });
} catch (e) { console.log("BŁĄD kursu USD/PLN", e.message); }

// Podstawowe wskaźniki (C/Z, dywidenda, marże...) z quoteSummary
try {
  const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
  const cookie = (r1.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, Cookie: cookie } })).text();
  const raw = (o) => (o && typeof o === "object" ? o.raw ?? null : o ?? null);
  for (const st of out.stocks) {
    if (st.cls === "sektory-pl" || st.m === "CR" || (st.cls === "indeksy" && st.y.endsWith(".WA") && !st.y.startsWith("ETF"))) continue;
    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(st.y)}?modules=summaryDetail,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(crumb)}`;
      const j = await (await fetch(url, { headers: { ...UA, Cookie: cookie } })).json();
      const r = j.quoteSummary?.result?.[0]; if (!r) continue;
      const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {};
      const f = {
        pe: raw(sd.trailingPE), pb: raw(ks.priceToBook), dy: raw(sd.dividendYield) ?? raw(sd.yield) ?? raw(sd.trailingAnnualDividendYield),
        mcap: raw(sd.marketCap), beta: raw(sd.beta) ?? raw(ks.beta) ?? raw(ks.beta3Year), pm: raw(fd.profitMargins) ?? raw(ks.profitMargins),
        roe: raw(fd.returnOnEquity), rg: raw(fd.revenueGrowth), er: raw(ks.annualReportExpenseRatio) ?? raw(sd.expenseRatio), aum: raw(sd.totalAssets),
      };
      for (const k of Object.keys(f)) if (f[k] == null || Number.isNaN(f[k])) delete f[k]; else f[k] = rnd(f[k], 4);
      if (Object.keys(f).length) st.f = f;
    } catch { /* bez wskaźników */ }
    await sleep(250);
  }
  out.fund_source = "Yahoo Finance quoteSummary (darmowe, nieoficjalne)";
} catch (e) { console.log("BŁĄD wskaźników", e.message); }

if (ONLY && existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, "utf8"));
  const ids = new Set(out.stocks.map((x) => x.s));
  const order = U.map((u) => u[1]);
  prev.stocks = [...prev.stocks.filter((x) => !ids.has(x.s)), ...out.stocks].sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s));
  writeFileSync(OUT, JSON.stringify(prev));
  console.log(`Dopisano ${out.stocks.length} walorów (błędy: ${failed.join(", ") || "brak"}), razem ${prev.stocks.length}`);
  process.exit(0);
}
// Bezpiecznik: nie nadpisuj dobrych danych gorszymi.
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (failed.length > 5 || out.fx.length < 1000) {
  console.log(`PRZERWANO: ${failed.length} walorów się nie pobrało albo brak kursu USD/PLN. Poprzedni plik zostaje bez zmian.`);
  process.exit(1);
}
if (prev?.as_of && out.as_of < prev.as_of) {
  console.log(`PRZERWANO: nowe notowania (${out.as_of}) są starsze niż zapisane (${prev.as_of}). Poprzedni plik zostaje bez zmian.`);
  process.exit(1);
}
if (prev && failed.length) {
  // Walory, których nie udało się pobrać, zostają ze starymi danymi.
  const have = new Set(out.stocks.map((x) => x.s));
  const keep = prev.stocks.filter((x) => !have.has(x.s) && failed.includes(x.y));
  const order = U.map((u) => u[1]);
  out.stocks = [...out.stocks, ...keep].sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s));
  if (keep.length) console.log(`Zostawiono stare dane dla: ${keep.map((x) => x.s).join(", ")}`);
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`OK: zapisano ${out.stocks.length} walorów (błędy: ${failed.join(", ") || "brak"}), notowania do ${out.as_of}, plik ${OUT}`);
