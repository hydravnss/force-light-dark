Scripts Playwright (WebKit, émulation iPhone 14 Pro) utilisés pour valider l'extension dans un vrai SillyTavern 1.19.0
(`localhost:8000`, extension liée dans `data/default-user/extensions/force-light-dark`). `lib.mjs` contient une APPROXIMATION
du thème « iMessage Dark » (pas le vrai CSS) ; `fld3.mjs` en a sa propre version (barre du haut transparente, barre d'envoi noire).
Lancer : `node fld3.mjs` (1.2.0 : le sombre n'applique RIEN — styles calculés + pixels identiques à « extension désinstallée » ; `--v110` = l'ancien
index.js 1.1.0, doit échouer), `node bubbles.mjs` (bulles jamais touchées), `node ui.mjs` (panneau, migration, modes, persistance).
Nécessite `npm i playwright` et `pip install pillow` ; captures dans /workspace/st-test-shots/fld3-*.png (chemin à adapter).
