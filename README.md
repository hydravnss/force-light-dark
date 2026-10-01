# Force Light Dark

Extension **SillyTavern** qui **FORCE le mode CLAIR par-dessus le thème** (page, barre du haut, tiroirs, popups, champs, barre d'envoi, barres de défilement, `theme-color`), même quand celui-ci écrit ses couleurs en dur avec `!important`.

## 🌙 Le mode sombre, c'est VOTRE thème, tel quel (depuis la 1.2.0)

Depuis la 1.1.0, la barre du haut et la barre d'envoi pouvaient virer au **gris anthracite** sur un thème noir OLED (ex. « iMessage Dark »), car l'extension peignait aussi le « sombre ». **Corrigé en 1.2.0 : l'extension ne modifie plus rien en sombre.**

| Situation | Ce que l'extension applique |
|---|---|
| ○ **Désactivé** | **Rien** (aucun `<style>`, aucune variable, aucun attribut de style) |
| 🌙 **Sombre** (et 🌗 **Auto** quand l'iPhone est en sombre) | **Rien qui change l'apparence** : **aucun `<style>`**, aucune variable `--SmartTheme*`, **aucun fond** (ni page, ni barre du haut, ni barre d'envoi, ni tiroirs, ni champ), aucun `color-scheme`. Seul geste (réglage « theme-color », actif par défaut) : la balise `<meta name="theme-color">` prend la **couleur de fond réelle de la page, lue dans le DOM** (`getComputedStyle(body)`), jamais une valeur codée en dur ; décochez le réglage pour ne rien toucher du tout |
| ☀️ **Clair** (et 🌗 **Auto** quand l'iPhone est en clair) | Le forçage clair (voir ci-dessous) |

En quittant le Clair, le `<style id="fld-style">` est **retiré** : le retour au sombre est exact (vérifié : styles calculés **et** captures pixel pour pixel identiques à « extension désinstallée »).

**Il n'y a plus aucune couleur sombre** : le sombre, c'est votre thème. Le panneau ne propose que les couleurs du **Clair**.

## ⛔ Les bulles de chat ne sont JAMAIS touchées (depuis la 1.1.0)

Force Light Dark **ne modifie ni les bulles, ni leurs couleurs, ni le texte des messages**, dans aucun mode (Clair, Sombre, Auto, Doux, Total) :

- aucune règle sur `.mes`, `.mes_block`, `.mes_text` (fond, couleur, bordure, ombre) ni sur `em` / `i` / `q` / `strong` / `a` / `u` à l'intérieur des messages ;
- aucune couleur de bulle réglable, aucun aperçu de bulle dans le panneau ;
- les variables `--SmartThemeUserMesBlurTintColor`, `--SmartThemeBotMesBlurTintColor` et `--SmartThemeChatTintColor` ne sont **jamais écrites** ;
- les variables que les bulles héritent (`--SmartThemeBodyColor`, `…EmColor`, `…QuoteColor`, `…UnderlineColor`, `…BorderColor`, `…ShadowColor`, `…BlurTintColor`) ne sont **pas posées sur `:root`** mais seulement sur les conteneurs **hors `#chat`** (`body > :not(#sheld)` et `#sheld > :not(#chat)`) : les messages gardent donc exactement ce que décident votre thème (ex. « iMessage Dark ») et vos autres extensions (ex. [bubble-colors](https://github.com/hydravnss/bubble-colors)) ;
- pas de transition de fondu dans `#chat`.

> ⚠️ **Non testée sur un vrai iPhone.** Testée dans un vrai SillyTavern 1.19.0 avec Playwright WebKit (émulation iPhone 14 Pro), avec une **approximation** du thème « iMessage Dark » (le vrai CSS n'est pas disponible) et l'extension bubble-colors installée. Voir « Tests ».

## Installation

SillyTavern > **Extensions** > **Install extension** > coller :

```
https://github.com/hydravnss/force-light-dark
```

Puis recharger la page. Réglages : Extensions > **Force Light Dark**. L'extension est **Désactivée** tant que vous n'avez rien choisi (aucun changement de votre thème).

## Modes

| Mode | Effet |
|---|---|
| ☀️ **Forcer Clair** | Clair imposé sur l'interface : fond de page `#ffffff`, **barre du haut / barre d'envoi / panneaux `#f2f2f7`**, champs blancs, texte noir. Les bulles ne bougent pas |
| 🌙 **Sombre** | **Votre thème tel quel** : l'extension n'applique rien (voir ci-dessus) |
| 🌗 **Auto** | Suit le réglage clair/sombre de l'iPhone (`prefers-color-scheme`), **en direct** sans recharger ; ou **horaire** (ex. clair dès 07:00, sombre dès 20:00). Sombre = votre thème tel quel |
| ○ **Désactivé** | Rien n'est modifié ; tout est restauré (theme-color, attributs, `<style>`) |

### Bouton rapide

- Entrée **☀️/🌙 dans le menu baguette ✨** (Extensions) : un toucher fait défiler *Désactivé → Clair → Sombre → Auto*.
- **Bouton flottant** optionnel (position horizontale/verticale et taille réglables par curseurs).

## Réglages

- **Intensité du forçage** : *Total* (défaut : écrase aussi les règles en dur du thème pour l'interface) ou *Doux* (variables `--SmartTheme*` hors `#chat` seulement).
- **Couleurs du mode Clair** : fond de page / champs (`#ffffff`), barres et panneaux (`#f2f2f7`), texte (`#000000`), texte atténué (placeholder…), avec bouton de réinitialisation. **Aucune couleur sombre** (le sombre = votre thème) et **aucune couleur de bulle.**
- **Masquer l'image de fond** (mode Total), **transition en fondu** (désactivée par défaut, active 600 ms pendant un changement, hors `#chat`), **theme-color / barre d'état**, notification au changement rapide.
- Bouton **Tout réinitialiser**.

### Migration

- **depuis la 1.1.x** : `colors.dark` (fond / texte / atténué sombres) est **supprimé** (mémoire, cache `localStorage` et `settings.json` côté serveur) ; vos couleurs Clair (fond, texte, atténué) sont conservées, la couleur des barres/panneaux Clair prend sa valeur par défaut `#f2f2f7` ; le mode, l'horaire, l'intensité, le bouton rapide sont conservés (un mode « Sombre » reste « Sombre » = votre thème, sans rien appliquer). `schema` passe à 3.
- **depuis la 1.0.x** : `paint` (élément portant le fond des bulles) et les couleurs `bot` / `user` / `userText` sont supprimés. Les valeurs invalides sont remplacées par les valeurs par défaut.

## Comment le forçage Clair fonctionne

- (Clair seulement) `<style id="fld-style">` est injecté comme **dernier élément de `<head>`** et y est remis par un `MutationObserver` si un autre style est ajouté après (avec garde-fou anti-boucle).
- Les sélecteurs sont préfixés par `html.fld-active[data-fld-mode="…"]:not(#fld_x):not(#fld_y)` (deux id de spécificité en plus) + `!important` : ils gagnent contre les règles `!important` d'un thème, **même si elles sont injectées après**. Les règles génériques (champs, popups, boutons, barres de défilement…) excluent `#chat *`.
- Forcé **en Clair** : fond de page, `#bg1`/`#bg_custom`, `#sheld`/`#chat` (fond du conteneur seulement), barre du haut, tiroirs, menus, popups, champs, boutons, barre d'envoi (`#form_sheld`, `#send_form`, `#send_textarea` : **couleurs seulement**), barres de défilement, `color-scheme`, `<meta name="theme-color">` et `apple-mobile-web-app-status-bar-style`.
- **Aucun `transform`, `filter` ni `position` n'est posé** : votre barre d'envoi fixe (`#form_sheld { position: fixed }`) et vos réglages `translateY` / `100dvh` ne bougent pas (position vérifiée identique en clair et en sombre).
- **Pas de flash au chargement** : le mode est appliqué dès le chargement du script depuis un cache `localStorage` (synchrone), puis depuis les réglages enregistrés. `loading_order` est 999 pour passer après les autres extensions.

## Pour votre propre CSS

L'extension pose sur `<html>` : `data-fld-mode="light|dark"` (mode **effectif**), `data-fld-setting="off|light|dark|auto"` et les classes `fld-light` (+ `fld-active`) ou `fld-dark`. Ces attributs ne changent aucun style par eux-mêmes ; seul le Clair injecte un `<style>`. Exemple :

```css
html[data-fld-mode="light"] #send_textarea { border-color: #c7c7cc !important; }
```

Variables disponibles (**Clair seulement**) : `--fld-bg`, `--fld-panel`, `--fld-input`, `--fld-text`, `--fld-em`.
API console : `ForceLightDark.setMode('light'|'dark'|'auto'|'off')`, `ForceLightDark.cycle()`, `ForceLightDark.getEffective()`.

## Avec autolightdark

Depuis la 1.1.0, Force Light Dark **n'interagit plus** avec [`autolightdark`](https://github.com/hydravnss/autolightdark) (plus de neutralisation de `#ald_style`, plus de réécriture de `data-ald-mode`). Les deux ne sont pas conçus pour être actifs ensemble (autolightdark pose ses variables, dont celles des bulles, sur `:root`) : n'utiliser qu'un des deux.

## Dépannage

- Une zone de l'interface reste sombre : vérifier que l'intensité est sur **Total** et écrire un petit CSS avec `html.fld-light …` (voir ci-dessus).
- Les bulles ne changent pas de couleur en mode Clair/Sombre : **c'est voulu**. Leur couleur dépend uniquement de votre thème et de vos autres extensions.
- Fond de page : si votre thème utilise une image, laisser « Masquer l'image de fond » activé.

## Tests

Voir `test/` (Playwright WebKit, émulation iPhone 14 Pro, vrai SillyTavern 1.19.0).

- `test/fld3.mjs` (**1.2.0, le sombre n'applique rien**) : approximation de « iMessage Dark » où `#top-bar` / `#top-settings-holder` / `#send_form` sont transparents et `#form_sheld` noir. Même séquence jouée dans une session **sans l'extension** (requêtes bloquées, référence) et **avec** (Désactivé → Sombre → Auto sombre → Clair → retour Sombre → retour Désactivé) : toutes les propriétés de **peinture** (couleurs, fonds, bordures, ombres, filtres, `backdrop-filter`, opacité, `color-scheme`, variables `--SmartTheme*`) de `#top-bar`, `#top-settings-holder`, `#form_sheld`, `#send_form`, `#nonQRFormItems`, `#send_textarea`, `body`, `#sheld`, `html` et **tous leurs descendants** (~16 000 éléments × propriétés, `::before` / `::after` / `::placeholder` compris, tiroir ouvert compris) sont **identiques**, et les **captures** sont identiques **pixel pour pixel** (PIL). Le Clair s'applique et le retour au sombre restaure exactement. Une 2ᵉ session de référence sert de témoin (0 écart entre deux sessions sans extension). `--v110` rejoue le test avec l'ancien `index.js` pour montrer que le test détecte la régression.
- `test/bubbles.mjs` : bulles jamais touchées (3 scénarios, Désactivé / Clair / Sombre / Auto).
- `test/ui.mjs` : panneau, migration, modes, Auto en direct, horaire, bouton rapide, persistance, pas de flash.

**Non vérifié** : vrai iPhone / Safari iOS, PWA plein écran, vrai thème « iMessage Dark » (approximé), rendu exact de la barre d'état iOS. Remarque : WebKit renvoie un style calculé périmé pour des éléments `display:none` après le retrait d'une feuille de style (artefact du moteur, reproduit sans l'extension, sans effet visible) ; le test force donc un recalcul identique des deux côtés.

## Licence

MIT
