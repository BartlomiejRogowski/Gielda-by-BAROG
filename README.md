# Giełda od Zera

Aplikacja do nauki giełdy na prawdziwych danych: lekcje, skaner wykresów, rotacja kapitału między sektorami
i klasami aktywów, analiza z ATH i cyklami, symulacje Monte Carlo, plan transakcji z kontrolą ryzyka
i trening na historii. Działa w przeglądarce i można ją zainstalować na telefonie („Dodaj do ekranu głównego”).

**To narzędzie edukacyjne, nie porada inwestycyjna.** Nie składa zleceń i nie mówi, co kupić.

## Jak to działa

| plik | co robi |
| --- | --- |
| `index.html`, `app.js`, `lessons.js` | aplikacja (ta sama co w artefakcie Claude) |
| `data.json` | notowania: 5 lat dziennie i pełna historia tygodniowa, ok. 110 walorów |
| `tools/update-data.mjs` | pobiera notowania (Yahoo Finance, darmowe i opóźnione) |
| `tools/build-site.mjs` | buduje stronę w `_site`: szkielet HTML, ikony, manifest, tryb offline |
| `.github/workflows/pages.yml` | codziennie po sesji w USA pobiera dane, buduje i publikuje stronę |

## Uruchomienie u siebie

```bash
node tools/update-data.mjs
node tools/build-site.mjs
```

Potem otwórz `_site` dowolnym prostym serwerem plików, np. `npx serve _site`.

## Dane

Notowania pochodzą z nieoficjalnego API Yahoo Finance. Jego regulamin dopuszcza użytek osobisty,
więc strona ma `noindex` (wyszukiwarki jej nie pokazują). Przy publicznym udostępnianiu warto przejść
na dostawcę, który pozwala wyświetlać dane, i podać go jako źródło.
