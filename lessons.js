/* Treść edukacyjna: lekcje, quizy i słowniczek. */
window.LESSONS = [
  {
    id: "akcja", t: "Czym jest akcja i jak działa giełda", mins: 3,
    key: "Akcja to kawałek firmy. ETF to cały koszyk firm w jednej transakcji.",
    body: [
      "Akcja to mały kawałek firmy. Kupując jedną akcję PKO BP, stajesz się współwłaścicielem banku: masz prawo do części zysku (dywidendy) i głos na walnym zgromadzeniu.",
      "Giełda to targowisko, na którym ludzie kupują i sprzedają akcje między sobą. Cena zmienia się, bo w każdej chwili zmienia się to, ile kupujący chcą zapłacić, a sprzedający chcą dostać.",
      "W Polsce działa GPW w Warszawie, z notowaniami mniej więcej od 9:00 do 17:00. Akcje z USA notowane są na NYSE i Nasdaq, w polskim czasie zwykle od 15:30 do 22:00.",
      "Żeby kupić akcje, potrzebujesz rachunku maklerskiego w domu maklerskim (u brokera). Większość brokerów ma konto demo z wirtualnymi pieniędzmi.",
      "ETF to fundusz notowany na giełdzie, który trzyma cały koszyk spółek, na przykład 500 największych firm w USA. Jedną transakcją rozkładasz ryzyko na setki firm."
    ],
    q: { q: "Co kupujesz, kupując akcję spółki?", a: ["Pożyczkę dla firmy z gwarantowanymi odsetkami", "Udział we własności firmy", "Prawo do produktów firmy po niższej cenie"], ok: 1,
      why: "Akcja to udział we własności. Nie ma gwarancji zysku: jej wartość może rosnąć i spadać. Pożyczką dla firmy jest obligacja." }
  },
  {
    id: "styl", t: "Inwestowanie a spekulacja", mins: 3,
    key: "Fundament to poduszka finansowa i długi horyzont. Krótkie granie to najtrudniejsza część rynku.",
    body: [
      "Inwestor kupuje na lata i liczy, że firma albo cały rynek będzie z czasem zarabiać więcej. Spekulant (trader) gra na krótkich ruchach ceny: dniach, godzinach, minutach.",
      "Krótkie granie jest dużo trudniejsze, niż wygląda. Badania rachunków osób handlujących codziennie (na przykład z Brazylii) pokazują, że zdecydowana większość z nich traci. Brokerzy CFD muszą podawać, jaki procent klientów traci na tych produktach, i zwykle jest to większość.",
      "Dla początkującego najbezpieczniejszy fundament to poduszka finansowa na koncie, a potem regularne, długoterminowe wpłaty do szerokiego ETF-u. Trading, jeśli w ogóle, to tylko mała część pieniędzy, których stratę zniesiesz.",
      "Ta aplikacja pozwala ćwiczyć oba podejścia na prawdziwych danych, ale bez prawdziwych pieniędzy."
    ],
    q: { q: "Które zdanie jest prawdziwe?", a: ["Większość osób grających codziennie na giełdzie zarabia", "Krótkoterminowe granie jest trudniejsze niż długoterminowe inwestowanie w szeroki rynek", "Dźwignia (np. CFD) zmniejsza ryzyko"], ok: 1,
      why: "Większość aktywnych traderów traci, a dźwignia zwiększa zarówno zyski, jak i straty." }
  },
  {
    id: "wykres", t: "Jak czytać wykres", mins: 4,
    key: "Wykres pokazuje przeszłość. Średnie porządkują szum, ale niczego nie przewidują.",
    body: [
      "Wykres liniowy łączy ceny zamknięcia kolejnych sesji. Wykres świecowy pokazuje więcej: otwarcie, najwyższą i najniższą cenę dnia oraz zamknięcie.",
      "Świeca zielona oznacza zamknięcie wyżej niż otwarcie, czerwona niżej. Cienkie knoty pokazują, jak daleko cena dotarła w ciągu dnia.",
      "Wolumen (słupki pod wykresem) to liczba akcji, które zmieniły właściciela. Ruch ceny przy dużym wolumenie znaczy więcej niż przy małym.",
      "Średnia krocząca, np. z 50 sesji, to średnia cena zamknięcia z ostatnich 50 dni. Wygładza szum i pokazuje kierunek. Cena nad rosnącą średnią z 200 sesji to klasyczny znak trendu wzrostowego."
    ],
    q: { q: "Co pokazuje średnia krocząca z 200 sesji?", a: ["Cenę, jaką akcja osiągnie za 200 dni", "Średnią cenę zamknięcia z ostatnich 200 sesji", "Liczbę transakcji z ostatnich 200 dni"], ok: 1,
      why: "Średnia patrzy wstecz. Niczego nie przewiduje, tylko porządkuje to, co już się wydarzyło." }
  },
  {
    id: "wskazniki", t: "Wskaźniki: trend, RSI, ATR i zmienność", mins: 4,
    key: "ATR mówi, ile kurs zwykle rusza się w ciągu dnia. Stop bliżej niż 1 ATR to proszenie się o wyrzucenie.",
    body: [
      "RSI (od 0 do 100) mierzy siłę ostatnich ruchów. Poniżej 30 kurs spadał szybko (wyprzedanie), powyżej 70 rósł szybko (wykupienie). To nie znaczy, że zaraz odbije: w silnym trendzie RSI potrafi długo zostać na skraju.",
      "ATR to średni dzienny zakres ruchu ceny z ostatnich 14 sesji. Jeśli ATR akcji za 100 zł wynosi 3 zł, to w zwykły dzień kurs waha się o około 3%. Stop bliżej niż 1 ATR zwykle wyrzuci Cię zwykły szum.",
      "Zmienność roczna mówi, jak mocno kurs zwykle skacze. Około 20% to spokojna spółka, 50% i więcej to jazda bez trzymanki.",
      "Maksymalne obsunięcie to największy spadek od szczytu do dołka. Zanim kupisz, zapytaj siebie, czy wytrzymasz taki spadek bez paniki."
    ],
    q: { q: "ATR spółki to 4 zł przy cenie 100 zł. Stawiasz stop 1 zł pod ceną wejścia. Co najpewniej się stanie?", a: ["Stop ochroni mnie przed każdą stratą", "Zwykłe dzienne wahania szybko wyrzucą mnie z pozycji", "Nic, ATR nie ma związku ze stopem"], ok: 1,
      why: "Skoro kurs rusza się zwykle o 4 zł dziennie, stop 1 zł niżej zostanie trafiony przez zwykły szum, zanim pomysł zdąży zadziałać." }
  },
  {
    id: "fundamenty", t: "Analiza fundamentalna w pigułce", mins: 4,
    key: "Porównuj wskaźniki z branżą i z historią spółki. Sama liczba niewiele mówi.",
    body: [
      "Cena akcji to jedno, a to, ile firma zarabia, to drugie. Analiza fundamentalna sprawdza, czy cena ma pokrycie w biznesie.",
      "C/Z (cena do zysku) mówi, ile złotych płacisz za złotówkę rocznego zysku. C/Z równe 10 to dziesięć lat obecnych zysków. Niskie C/Z bywa okazją albo sygnałem, że rynek widzi kłopoty. Wysokie oznacza, że rynek liczy na szybki wzrost.",
      "C/WK (cena do wartości księgowej) mówi, ile płacisz za majątek netto firmy. Jest ważne zwłaszcza przy bankach i ubezpieczycielach.",
      "Marża netto to część każdej złotówki przychodu, która zostaje jako zysk. ROE pokazuje, ile zysku firma wypracowuje z kapitału właścicieli. Stopa dywidendy to procent ceny, jaki firma wypłaciła akcjonariuszom w ostatnim roku.",
      "Wskaźniki porównuj z firmami z tej samej branży i z historią tej samej spółki. C/Z równe 30 to dużo dla banku, a mało dla szybko rosnącej spółki technologicznej."
    ],
    q: { q: "Spółka ma C/Z równe 8. Co to oznacza?", a: ["Na pewno jest tania i warto ją kupić", "Płacisz 8 zł za każdą złotówkę rocznego zysku; to może być okazja albo znak ryzyka", "Kurs wzrośnie o 8%"], ok: 1,
      why: "Niskie C/Z to punkt wyjścia do pytań, nie gotowa odpowiedź. Sprawdź, dlaczego rynek wycenia firmę tak nisko." }
  },
  {
    id: "ryzyko", t: "Ryzyko: stop, R i stosunek zysku do ryzyka", mins: 5,
    key: "Wyjście planujesz przed wejściem. Próg opłacalności to 1 / (1 + R).",
    body: [
      "Zanim kupisz, ustal dwie ceny: stop, czyli miejsce, w którym uznajesz, że się pomyliłeś, i cel, czyli miejsce, w którym bierzesz zysk. W tej aplikacji robi to Planer wyjścia.",
      "R to Twoje ryzyko na jedną akcję: cena wejścia minus stop. Kupujesz po 100 zł ze stopem 95 zł, więc 1R = 5 zł. Cel 2R to 110 zł.",
      "Im dalszy cel, tym rzadziej musisz trafiać, żeby wyjść na zero. Przy celu 1R potrzebujesz 50% trafień, przy 2R 33%, a przy 3R 25%. Wzór to 1 / (1 + R).",
      "Stop to zlecenie, nie gwarancja. Jeśli spółka otworzy sesję z luką poniżej stopu, na przykład po złych wynikach, sprzedasz taniej, niż planowałeś. Zobaczysz to w treningu.",
      "Złota zasada: nigdy nie przesuwaj stopu dalej od ceny, gdy kurs idzie przeciwko Tobie."
    ],
    q: { q: "Wejście 50 zł, stop 48 zł, cel 56 zł. Jaki jest stosunek zysku do ryzyka?", a: ["1 : 1", "3 : 1", "2 : 1"], ok: 1,
      why: "Ryzyko to 2 zł (50 − 48), możliwy zysk 6 zł (56 − 50). 6 / 2 = 3, czyli cel 3R. Bez kosztów wystarczy trafiać w ponad 25% przypadków." }
  },
  {
    id: "pozycja", t: "Ile kupić? Wielkość pozycji", mins: 4,
    key: "Liczba akcji = maksymalna strata / ryzyko na akcję. Dalszy stop to mniej akcji, nie większa strata.",
    body: [
      "Najważniejsze pytanie to nie „co kupić”, tylko „ile”. Wielkość pozycji decyduje, czy jedna pomyłka boli, czy rujnuje konto.",
      "Popularna zasada mówi, żeby na jednej transakcji ryzykować najwyżej około 1% kapitału. Przy 10 000 zł to 100 zł straty, jeśli zadziała stop.",
      "Liczba akcji to maksymalna strata podzielona przez ryzyko na akcję. Stop 5 zł pod wejściem i limit 100 zł dają 20 akcji.",
      "Menedżer budżetu sprawdza naraz cztery limity: maksymalną stratę, limit pozycji, maksymalne zlecenie i gotówkę po odłożeniu bufora. Wybiera najmniejszy. Strażnik ryzyka blokuje wszystko, co łamie Twoje zasady.",
      "Seria 10 strat po 1% to około −10% konta. Seria 10 strat po 10% to około −65%. Małe ryzyko na transakcję to warunek przetrwania."
    ],
    q: { q: "Masz 20 000 zł i ryzykujesz 1% na transakcję. Wejście 80 zł, stop 76 zł. Ile akcji kupisz?", a: ["50", "250", "200"], ok: 0,
      why: "1% z 20 000 zł to 200 zł. Ryzyko na akcję to 4 zł. 200 / 4 = 50 akcji o wartości 4000 zł." }
  },
  {
    id: "prognozy", t: "Prognozy: czego nikt nie wie", mins: 4,
    key: "Symulacja pokazuje zakres scenariuszy, a nie przyszłość. Uważaj na dopasowanie do szumu.",
    body: [
      "Nikt nie zna przyszłych cen: ani analityk z telewizji, ani algorytm, ani ta aplikacja. Da się za to policzyć zakres możliwych scenariuszy i sprawdzić, jak dana reguła działała w przeszłości.",
      "Symulacja Monte Carlo (w aplikacji: Wehikuł czasu) losuje 10 000 możliwych przyszłości z prawdziwych dziennych ruchów danej spółki. Pokazuje, jak często plan trafiał w cel, a jak często w stop.",
      "Test historyczny (backtest) stosuje tę samą regułę do każdego dnia z przeszłości. To, co działało, nie musi działać dalej. Ale to, co nie działało nawet w przeszłości, zwykle nie zadziała.",
      "Pułapka: jeśli zmieniasz parametry tak długo, aż wynik wygląda świetnie, dopasowujesz się do szumu (to tzw. przeuczenie). Prosta reguła sprawdzona na wielu spółkach jest więcej warta niż idealnie dopasowana do jednej.",
      "Wyniki finansowe, wiadomości i nastroje potrafią zrobić rzeczy, których nie było w danych z ostatnich lat."
    ],
    q: { q: "Symulacja pokazała 60% szans, że plan trafi w cel przed stopem. Co to znaczy?", a: ["Na pewno zarobię", "Jeśli przyszłość będzie podobna do ostatnich lat, plan częściej trafiał w cel niż w stop; to nie gwarancja", "Cena wzrośnie o 60%"], ok: 1,
      why: "Symulacja to rachunek na danych z przeszłości. Mówi o częstości w podobnych warunkach, a nie o tym, co stanie się tym razem." }
  },
  {
    id: "rotacja", t: "Rotacja kapitału i siła względna", mins: 5,
    key: "Swing trader płynie z prądem: szuka wejść u liderów, a tanie po odpływie traktuje ostrożnie.",
    body: [
      "Kapitał krąży między klasami aktywów i sektorami. Gdy gospodarka przyspiesza, zwykle zyskują spółki cykliczne, małe spółki i surowce przemysłowe. Gdy zwalnia, pieniądze uciekają do sektorów defensywnych (żywność, zdrowie, energetyka sieciowa), obligacji skarbowych i złota. To tendencja, a nie prawo.",
      "Siła względna porównuje dwa wykresy: cenę sektora dzieli się przez cenę rynku. Rosnąca linia oznacza, że sektor radzi sobie lepiej niż rynek, nawet jeśli oba spadają.",
      "Wykres rotacji ma cztery ćwiartki. Liderzy są silniejsi od rynku i przewaga rośnie. Słabnące wciąż są silniejsze, ale tracą impet. Maruderzy są słabsi i dalej tracą. Poprawiające się są słabsze, ale zaczynają odrabiać. Walory zwykle krążą zgodnie z ruchem wskazówek zegara.",
      "Prawdziwych wpłat i wypłat z funduszy nie widać w darmowych danych. Aplikacja szacuje napływ z ceny i wolumenu (Chaikin Money Flow): gdy sesje zamykają się blisko maksimum przy dużym obrocie, przeważają kupujący.",
      "Swing trader zwykle szuka wejść w sektorach z ćwiartki Liderów albo tych, które właśnie do niej wchodzą, a unika Maruderów. Sektor tani po odpływie kapitału może tanieć dalej. Rozsądniej poczekać na oznaki zmiany, na przykład przejście do Poprawiających się i napływ w wolumenie."
    ],
    q: { q: "Sektor jest w ćwiartce „Poprawiające się”. Co to znaczy?", a: ["Jest silniejszy od rynku i dalej przyspiesza", "Jest słabszy od rynku, ale zaczyna odrabiać straty względem niego", "Na pewno zaraz wzrośnie"], ok: 1,
      why: "Poprawiające się to walory słabsze od benchmarku, których siła względna zaczęła rosnąć. To wczesny sygnał, który często się nie potwierdza." }
  },
  {
    id: "koszty", t: "Koszty, podatki i konta", mins: 4,
    key: "Prowizje i podatek Belki (19%) zjadają wynik. IKE i IKZE dają ulgi przy długim horyzoncie.",
    body: [
      "Prowizja i spread (różnica między ceną kupna a sprzedaży) zjadają wynik, zwłaszcza przy częstym handlu. 0,3% prowizji przy kupnie i przy sprzedaży to 0,6% kosztu na każdej transakcji.",
      "Od zysków kapitałowych w Polsce płacisz 19% podatku (podatek Belki). Broker przysyła PIT-8C, a Ty rozliczasz się w PIT-38 do końca kwietnia. Stratę z danego roku można, z limitami, odliczać od zysków w kolejnych latach.",
      "IKE i IKZE to konta emerytalne z ulgą podatkową. Na IKE, gdy spełnisz warunki (m.in. wypłata po 60. roku życia), nie płacisz podatku Belki. Na IKZE wpłaty obniżają podatek dochodowy już teraz. Oba konta mają roczne limity wpłat, które co roku się zmieniają.",
      "Kupując akcje z USA, ryzykujesz też kursem dolara. Gdy złoty się umacnia, Twoje dolarowe akcje są warte mniej złotych.",
      "Zacznij od konta demo albo od bardzo małych kwot. Małe, prawdziwe pieniądze uczą emocji, których demo nie odda."
    ],
    q: { q: "Zarobiłeś 1000 zł na sprzedaży akcji na zwykłym rachunku maklerskim. Ile podatku zapłacisz?", a: ["Nic, podatek płaci broker", "190 zł", "100 zł"], ok: 1,
      why: "Podatek Belki to 19% zysku: 1000 zł × 19% = 190 zł. Rozliczasz go sam w PIT-38." }
  },
  {
    id: "psychologia", t: "Psychologia i dziennik transakcji", mins: 3,
    key: "Plan przed wejściem, limity dzienne i dziennik chronią przed decyzjami w nerwach.",
    body: [
      "Najwięcej traci się nie przez złą analizę, tylko przez emocje: strach przed przegapieniem okazji (FOMO), odgrywanie się po stracie i trzymanie straty, „aż wróci”.",
      "Plan przed wejściem chroni przed decyzjami w nerwach. Zapisz, dlaczego kupujesz, gdzie jest stop, gdzie cel i ile ryzykujesz.",
      "Prowadź dziennik. Po 20–30 transakcjach zobaczysz liczby zamiast wrażeń: procent trafień, średnie R i to, czy trzymasz się planu.",
      "Ustal limit dzienny. Gdy go osiągniesz, kończysz na ten dzień. W treningu Strażnik ryzyka pilnuje tego automatycznie.",
      "Trenuj w trybie na ślepo (z ukrytą nazwą i datami). Uczysz się wtedy czytać wykres, a nie przypominać sobie, co stało się z kursem."
    ],
    q: { q: "Właśnie straciłeś na transakcji 2R. Co robisz?", a: ["Od razu otwieram większą pozycję, żeby się odegrać", "Trzymam się planu i limitów, a transakcję zapisuję w dzienniku", "Przesuwam stopy w pozostałych pozycjach dalej"], ok: 1,
      why: "Odgrywanie się i przesuwanie stopów to dwa najszybsze sposoby na zamianę małej straty w dużą." }
  }
];

window.GLOSSARY = [
  ["Akcja", "Udział we własności spółki. Daje prawo do części zysku (dywidendy) i głosu na walnym zgromadzeniu."],
  ["ETF", "Fundusz notowany na giełdzie, który odwzorowuje indeks, np. S&P 500 albo WIG20. Kupujesz cały koszyk spółek naraz."],
  ["Dywidenda", "Część zysku, którą spółka wypłaca akcjonariuszom. Nie każda spółka ją płaci."],
  ["Wolumen", "Liczba akcji, które zmieniły właściciela w danym okresie."],
  ["Świeca", "Graficzny zapis jednej sesji: otwarcie, maksimum, minimum i zamknięcie."],
  ["Średnia krocząca (SMA)", "Średnia cena zamknięcia z ostatnich N sesji, np. 20, 50 lub 200."],
  ["RSI", "Wskaźnik siły ruchów od 0 do 100. Poniżej 30 mówi się o wyprzedaniu, powyżej 70 o wykupieniu."],
  ["ATR", "Średni dzienny zakres ruchu ceny z 14 sesji. Pomaga ustawić stop poza zasięgiem zwykłego szumu."],
  ["Zmienność", "Jak mocno kurs zwykle się waha, liczona rocznie z dziennych zmian."],
  ["Obsunięcie (drawdown)", "Spadek od szczytu do dołka. Największe obsunięcie pokazuje najgorszy okres."],
  ["Stop-loss", "Zlecenie sprzedaży, gdy cena spadnie do ustalonego poziomu. Ogranicza stratę, ale nie gwarantuje ceny."],
  ["Cel (take-profit)", "Cena, przy której zamykasz pozycję z zyskiem."],
  ["R", "Ryzyko na jedną akcję: cena wejścia minus stop. Wynik transakcji mierzy się w R, np. +2R albo −1R."],
  ["Zysk do ryzyka (R:R)", "Ile możesz zarobić na każdą złotówkę ryzyka. Cel 2R to stosunek 2 : 1."],
  ["Luka cenowa", "Sytuacja, gdy sesja otwiera się daleko od poprzedniego zamknięcia. Stop może się wtedy wykonać gorzej."],
  ["Płynność", "Jak łatwo kupić lub sprzedać akcje bez ruszania ceny. Mierzy się ją m.in. dziennym obrotem."],
  ["C/Z (P/E)", "Cena akcji podzielona przez roczny zysk na akcję."],
  ["C/WK (P/B)", "Cena akcji podzielona przez wartość księgową (majątek netto) na akcję."],
  ["ROE", "Zysk netto podzielony przez kapitał własny. Pokazuje, jak efektywnie firma pracuje pieniędzmi właścicieli."],
  ["Marża netto", "Zysk netto jako procent przychodów."],
  ["Kapitalizacja", "Wartość wszystkich akcji spółki: cena razy liczba akcji."],
  ["Beta", "Jak mocno akcja zwykle porusza się względem całego rynku. Beta 1,5 oznacza ruchy średnio o 50% większe."],
  ["Monte Carlo", "Metoda, która losuje tysiące możliwych scenariuszy, żeby pokazać rozkład wyników."],
  ["Backtest", "Sprawdzenie reguły na danych historycznych."],
  ["Konto demo", "Rachunek u brokera z wirtualnymi pieniędzmi do ćwiczeń."],
  ["Podatek Belki", "19% podatku od zysków kapitałowych w Polsce, rozliczany w PIT-38."],
  ["IKE / IKZE", "Indywidualne konta emerytalne z ulgami podatkowymi i rocznymi limitami wpłat."],
  ["Spread", "Różnica między najlepszą ceną kupna a najlepszą ceną sprzedaży."],
  ["ATH", "All-time high: najwyższa cena w całej historii notowań."],
  ["Hossa", "Okres wzrostów: od dołka bessy do szczytu, z którego zaczyna się kolejna bessa."],
  ["Bessa", "Spadek o co najmniej umowny próg od szczytu, np. 20% dla indeksów akcji."],
  ["Cykl rynkowy", "Następujące po sobie bessa i hossa. Ich długość bardzo się różni i nie da się jej przewidzieć."],
  ["Skala logarytmiczna", "Oś, na której ten sam odstęp oznacza ten sam procent zmiany, a nie tę samą kwotę."],
  ["Siła względna (RS)", "Cena waloru podzielona przez cenę benchmarku. Rośnie, gdy walor radzi sobie lepiej niż rynek."],
  ["Benchmark", "Punkt odniesienia, np. S&P 500 dla sektorów USA albo WIG20TR dla spółek z GPW."],
  ["Rotacja sektorowa", "Przepływ kapitału między sektorami w rytmie koniunktury i nastrojów."],
  ["Wykres RRG", "Wykres rotacji: siła względna na osi poziomej, jej pęd na pionowej, cztery ćwiartki."],
  ["Chaikin Money Flow (CMF)", "Wskaźnik od −1 do +1 szacujący przewagę kupujących lub sprzedających z ceny i wolumenu."],
  ["Relatywny wolumen", "Dzisiejszy obrót podzielony przez średni obrót z ostatnich sesji."],
  ["Swing trading", "Granie na ruchach trwających od kilku dni do kilku tygodni."],
  ["Obligacja", "Pożyczka dla państwa lub firmy z ustalonym oprocentowaniem. Jej cena spada, gdy rosną stopy procentowe."],
  ["Surowce", "Złoto, ropa, miedź, zboża i inne towary. Nie dają zysków ani dywidend, cena zależy od popytu i podaży."],
  ["Kryptowaluty", "Cyfrowe aktywa, np. bitcoin. Notowane całą dobę, bardzo zmienne, bez zysków i dywidend."],
  ["Dźwignia / CFD", "Pożyczone pieniądze lub instrumenty pochodne, które zwiększają zarówno zyski, jak i straty. Nie dla początkujących."]
];
