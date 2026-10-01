Scripts Playwright (WebKit, émulation iPhone 14 Pro) utilisés pour valider l'extension dans un vrai SillyTavern 1.19.0
(`localhost:8000`, extension liée dans `data/default-user/extensions/force-light-dark`). `lib.mjs` contient une APPROXIMATION
du thème « iMessage Dark » (pas le vrai CSS) qui lit aussi des variables --SmartTheme* dans les bulles (pour détecter toute fuite).
Lancer : `node bubbles.mjs` (bulles jamais touchées, 3 scénarios dont bubble-colors actif) puis `node ui.mjs` (panneau, migration, modes, persistance).
Nécessite `npm i playwright` ; captures dans /workspace/st-test-shots/fld2-*.png (chemin à adapter).
