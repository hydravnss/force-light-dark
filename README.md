# Force Light Dark

Extension **SillyTavern** qui **FORCE** le mode clair ou sombre **par-dessus le thème**, même quand celui-ci écrit ses couleurs sombres en dur avec `!important` (ex. thème « iMessage Dark » : bulles `#262628 !important`, fond OLED noir, etc.).

> ⚠️ **Non testée sur un vrai iPhone.** Testée dans un vrai SillyTavern 1.19.0 avec Playwright WebKit (émulation iPhone 14 Pro). Le vrai CSS « iMessage Dark » n'étant pas disponible, il est **approximé** par des règles équivalentes (bulles `.mes_text` en `!important`, `.mes`/`.mes_block` transparents, `#form_sheld` fixe, etc.). Si une zone de votre thème résiste, voir « Dépannage ».

## Installation

SillyTavern > **Extensions** > **Install extension** > coller :

```
https://github.com/hydravnss/force-light-dark
```

Puis recharger la page. Réglages : Extensions > **Force Light Dark**. L'extension est **Désactivée** tant que vous n'avez rien choisi (aucun changement de votre thème).

## Modes

| Mode | Effet |
|---|---|
| ☀️ **Forcer Clair** | Clair imposé (fond `#fff`, bulle reçue `#e9e9eb` texte noir, bulle envoyée `#0a84ff` texte blanc) |
| 🌙 **Forcer Sombre** | Sombre imposé, noir OLED (fond `#000`, bulle reçue `#262628`, envoyée `#0a84ff`, italique `#919191`) |
| 🌗 **Auto** | Suit le réglage clair/sombre de l'iPhone (`prefers-color-scheme`), **en direct** sans recharger ; ou **horaire** (ex. clair dès 07:00, sombre dès 20:00) |
| ○ **Désactivé** | Rien n'est modifié ; tout est restauré (theme-color, attributs, `<style>`) |

### Bouton rapide

- Entrée **☀️/🌙 dans le menu baguette ✨** (Extensions) : un toucher fait défiler *Désactivé → Clair → Sombre → Auto*.
- **Bouton flottant** optionnel (position horizontale/verticale et taille réglables par curseurs).

## Réglages

- **Intensité du forçage** : *Total* (défaut : écrase aussi les règles en dur du thème) ou *Doux* (variables `--SmartTheme*` seulement ; un thème qui force ses couleurs en dur peut alors reprendre la main).
- **Couleurs personnalisables par mode** : fond, bulle reçue, bulle envoyée, texte, texte de la bulle envoyée, italique — avec aperçu en direct et boutons de réinitialisation.
- **Élément portant le fond des bulles** : `.mes_text` (thèmes type iMessage, défaut), `.mes_block`, `.mes`, détection automatique, ou aucun.
- **Masquer l'image de fond** (mode Total), **transition en fondu** (désactivée par défaut, active seulement 600 ms pendant un changement), **theme-color / barre d'état**, notification au changement rapide.
- Bouton **Tout réinitialiser**.

## Comment le forçage fonctionne

- `<style id="fld-style">` est injecté comme **dernier élément de `<head>`** et y est remis par un `MutationObserver` si un autre style est ajouté après (avec garde-fou anti-boucle).
- Tous les sélecteurs sont préfixés par `html.fld-active[data-fld-mode="…"]:not(#fld_x):not(#fld_y)` (deux id de spécificité en plus) + `!important` : ils gagnent contre les règles `!important` d'un thème, **même si elles sont injectées après**.
- Variables SillyTavern surchargées sur `:root` (`--SmartThemeBodyColor`, `…BlurTintColor`, `…ChatTintColor`, `…UserMesBlurTintColor`, `…BotMesBlurTintColor`, `…EmColor`, `…UnderlineColor`, `…QuoteColor`, `…BorderColor`, `…ShadowColor`…) **et** vraies règles : fond de page, bulles (`.mes[is_user="true"|"false"] .mes_text`), `em/i/q/strong/a`, `#send_textarea`, `#form_sheld`, `#top-bar`, tiroirs, menus, popups, champs, boutons, barres de défilement.
- `color-scheme`, `<meta name="theme-color">` et `apple-mobile-web-app-status-bar-style` sont mis à jour.
- **Aucun `transform`, `filter` ni `position` n'est posé** sur un ancêtre : seules des **couleurs** changent, donc votre barre d'envoi fixe (`#form_sheld { position: fixed }`) et vos réglages `translateY` / `100dvh` ne bougent pas (position vérifiée identique en clair et en sombre).
- **Pas de flash au chargement** : le mode est appliqué dès le chargement du script depuis un cache `localStorage` (synchrone), puis depuis les réglages enregistrés. `loading_order` est 999 pour passer après les autres extensions.

## Pour votre propre CSS

L'extension pose sur `<html>` : `data-fld-mode="light|dark"` (mode **effectif**), `data-fld-setting="off|light|dark|auto"` et les classes `fld-active` + `fld-light` / `fld-dark`. Exemple :

```css
html.fld-light #chat .mes .mes_text { box-shadow: 0 1px 2px rgba(0,0,0,.15) !important; }
html[data-fld-mode="dark"] #send_textarea { border-color: #333 !important; }
```

Des variables sont aussi disponibles : `--fld-bg`, `--fld-panel`, `--fld-input`, `--fld-text`, `--fld-bot`, `--fld-user`, `--fld-user-text`, `--fld-em`.
API console : `ForceLightDark.setMode('light'|'dark'|'auto'|'off')`, `ForceLightDark.cycle()`, `ForceLightDark.getEffective()`.

## Avec autolightdark

Si [`autolightdark`](https://github.com/hydravnss/autolightdark) est aussi installé et actif : **Force Light Dark prend le dessus** dès qu'il n'est pas « Désactivé ». Il détecte `#ald_style`, le neutralise (`disabled`), repose les variables en style inline `!important` (comme le fait autolightdark) et **réécrit `html[data-ald-mode]` avec son propre mode** : le bloc `html[data-ald-mode="light"] …` que vous avez ajouté à votre CSS suit donc le mode forcé. En « Désactivé », autolightdark retrouve la main. Recommandé : n'utiliser qu'un des deux.

## Dépannage

- Une zone reste sombre : vérifier que l'intensité est sur **Total**, essayer **Détection automatique** pour l'élément portant le fond des bulles, et écrire un petit CSS avec `html.fld-light …` (voir ci-dessus).
- Fond de page : si votre thème utilise une image, laisser « Masquer l'image de fond » activé.

## Tests

Voir `test/` (Playwright WebKit, émulation iPhone 14 Pro). Vérifié : bulles/fond/champ/barres en clair puis en sombre malgré un thème en dur `!important` injecté après l'extension ; Auto suit `prefers-color-scheme` en direct ; cycle du bouton ; persistance après rechargement ; `data-fld-mode` posé avant la disparition du préchargeur ; mise à jour de `theme-color` ; aucune erreur console ; position de `#form_sheld` inchangée. **Non vérifié** : vrai iPhone / Safari iOS, PWA plein écran, vrai thème « iMessage Dark », rendu exact de la barre d'état iOS.

## Licence

MIT
