# Force Light Dark

Extension **SillyTavern** qui **FORCE** le mode clair ou sombre **par-dessus le thème** (page, barre du haut, tiroirs, popups, champs, barre d'envoi, barres de défilement, `theme-color`), même quand celui-ci écrit ses couleurs en dur avec `!important`.

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
| ☀️ **Forcer Clair** | Clair imposé sur l'interface (fond `#fff`, texte noir, panneaux/champs clairs) |
| 🌙 **Forcer Sombre** | Sombre imposé, noir OLED (fond `#000`, texte `#f2f2f7`) |
| 🌗 **Auto** | Suit le réglage clair/sombre de l'iPhone (`prefers-color-scheme`), **en direct** sans recharger ; ou **horaire** (ex. clair dès 07:00, sombre dès 20:00) |
| ○ **Désactivé** | Rien n'est modifié ; tout est restauré (theme-color, attributs, `<style>`) |

### Bouton rapide

- Entrée **☀️/🌙 dans le menu baguette ✨** (Extensions) : un toucher fait défiler *Désactivé → Clair → Sombre → Auto*.
- **Bouton flottant** optionnel (position horizontale/verticale et taille réglables par curseurs).

## Réglages

- **Intensité du forçage** : *Total* (défaut : écrase aussi les règles en dur du thème pour l'interface) ou *Doux* (variables `--SmartTheme*` hors `#chat` seulement).
- **Couleurs personnalisables par mode** : fond de page, texte de l'interface, texte atténué (placeholder…), avec boutons de réinitialisation. **Aucune couleur de bulle.**
- **Masquer l'image de fond** (mode Total), **transition en fondu** (désactivée par défaut, active 600 ms pendant un changement, hors `#chat`), **theme-color / barre d'état**, notification au changement rapide.
- Bouton **Tout réinitialiser**.

### Migration depuis la 1.0.x

Les anciens réglages sont migrés automatiquement au premier chargement : `paint` (élément portant le fond des bulles) et les couleurs `bot` / `user` / `userText` sont **supprimés** (y compris du cache `localStorage` et de `settings.json` côté serveur) ; le mode, l'horaire, l'intensité, le bouton rapide et les couleurs de fond / texte / italique déjà choisies sont conservés. Les valeurs invalides sont remplacées par les valeurs par défaut.

## Comment le forçage fonctionne

- `<style id="fld-style">` est injecté comme **dernier élément de `<head>`** et y est remis par un `MutationObserver` si un autre style est ajouté après (avec garde-fou anti-boucle).
- Les sélecteurs sont préfixés par `html.fld-active[data-fld-mode="…"]:not(#fld_x):not(#fld_y)` (deux id de spécificité en plus) + `!important` : ils gagnent contre les règles `!important` d'un thème, **même si elles sont injectées après**. Les règles génériques (champs, popups, boutons, barres de défilement…) excluent `#chat *`.
- Forcé : fond de page, `#bg1`/`#bg_custom`, `#sheld`/`#chat` (fond du conteneur seulement), barre du haut, tiroirs, menus, popups, champs, boutons, barre d'envoi (`#form_sheld`, `#send_form`, `#send_textarea` : **couleurs seulement**), barres de défilement, `color-scheme`, `<meta name="theme-color">` et `apple-mobile-web-app-status-bar-style`.
- **Aucun `transform`, `filter` ni `position` n'est posé** : votre barre d'envoi fixe (`#form_sheld { position: fixed }`) et vos réglages `translateY` / `100dvh` ne bougent pas (position vérifiée identique en clair et en sombre).
- **Pas de flash au chargement** : le mode est appliqué dès le chargement du script depuis un cache `localStorage` (synchrone), puis depuis les réglages enregistrés. `loading_order` est 999 pour passer après les autres extensions.

## Pour votre propre CSS

L'extension pose sur `<html>` : `data-fld-mode="light|dark"` (mode **effectif**), `data-fld-setting="off|light|dark|auto"` et les classes `fld-active` + `fld-light` / `fld-dark`. Exemple :

```css
html[data-fld-mode="dark"] #send_textarea { border-color: #333 !important; }
```

Variables disponibles : `--fld-bg`, `--fld-panel`, `--fld-input`, `--fld-text`, `--fld-em`.
API console : `ForceLightDark.setMode('light'|'dark'|'auto'|'off')`, `ForceLightDark.cycle()`, `ForceLightDark.getEffective()`.

## Avec autolightdark

Depuis la 1.1.0, Force Light Dark **n'interagit plus** avec [`autolightdark`](https://github.com/hydravnss/autolightdark) (plus de neutralisation de `#ald_style`, plus de réécriture de `data-ald-mode`). Les deux ne sont pas conçus pour être actifs ensemble (autolightdark pose ses variables, dont celles des bulles, sur `:root`) : n'utiliser qu'un des deux.

## Dépannage

- Une zone de l'interface reste sombre : vérifier que l'intensité est sur **Total** et écrire un petit CSS avec `html.fld-light …` (voir ci-dessus).
- Les bulles ne changent pas de couleur en mode Clair/Sombre : **c'est voulu**. Leur couleur dépend uniquement de votre thème et de vos autres extensions.
- Fond de page : si votre thème utilise une image, laisser « Masquer l'image de fond » activé.

## Tests

Voir `test/` (Playwright WebKit, émulation iPhone 14 Pro).

- `test/bubbles.mjs` : pour 3 scénarios (thème « iMessage Dark » approximé + bubble-colors actif ; thème seul ; ST par défaut), en Désactivé / Clair / Sombre / Auto / Doux, compare le style calculé de `.mes_text` (bot et user), `.mes`, `.mes_block`, `em`, `i`, `q`, `strong`, `a`, `p`, nom, **toutes** les propriétés calculées de **tous** les éléments de chaque message, et les variables `--SmartTheme*` vues depuis un message : **identiques à Désactivé**. Vérifie aussi que le reste (page, barre du haut, tiroirs, champ, barre d'envoi, `theme-color`) bascule bien et que `#form_sheld` ne bouge pas.
- `test/ui.mjs` : panneau sans UI de bulles, migration des réglages 1.0.x, modes, Auto en direct, horaire, bouton rapide, persistance, pas de flash, aucune erreur console.

**Non vérifié** : vrai iPhone / Safari iOS, PWA plein écran, vrai thème « iMessage Dark » (approximé), rendu exact de la barre d'état iOS.

## Licence

MIT
